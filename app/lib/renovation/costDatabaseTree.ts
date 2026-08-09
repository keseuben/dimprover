import {
  costMajorItems,
  disciplineLabels,
  type CostDetailLine,
  type CostDiscipline,
  type CostMajorItem,
  type CostWorkType,
} from "./costDatabase";

export type CostTreeNodeType = "module" | "discipline" | "group" | "majorItem" | "detailItem";

export type CostTreeNode = {
  id: string;
  parentId: string | null;
  type: CostTreeNodeType;
  name: string;
  code?: string;
  unit?: string;
  description?: string;
  workType?: CostWorkType;
  discipline?: CostDiscipline;
  majorItemId?: string;
  detailLineId?: string;
  children: CostTreeNode[];
  sortOrder: number;
};

export const workTypeLabels: Record<CostWorkType, string> = {
  new_build: "Új építés",
  renovation: "Felújítás",
  repair: "Javítás / karbantartás",
  operation: "Üzemeltetés",
};

const workTypeSort: CostWorkType[] = ["new_build", "renovation", "repair", "operation"];

export function buildCostDatabaseTree(): CostTreeNode[] {
  return workTypeSort.map((workType, workTypeIndex) => {
    const itemsForWorkType = costMajorItems.filter((item) => item.workTypes.includes(workType));
    const disciplineNodes = Object.entries(disciplineLabels)
      .map(([disciplineId, disciplineLabel], disciplineIndex) => {
        const typedDiscipline = disciplineId as CostDiscipline;
        const disciplineItems = itemsForWorkType.filter((item) => item.discipline === typedDiscipline);
        if (disciplineItems.length === 0) return null;

        const groupNames = Array.from(new Set(disciplineItems.map((item) => item.group))).sort((a, b) => a.localeCompare(b, "hu"));
        const groupNodes = groupNames.map((groupName, groupIndex) => {
          const groupItems = disciplineItems.filter((item) => item.group === groupName);
          const majorNodes = groupItems.map((item, itemIndex) => majorItemToNode(item, `${workType}:${disciplineId}:${groupName}`, itemIndex));
          return {
            id: `${workType}:${disciplineId}:${groupName}`,
            parentId: `${workType}:${disciplineId}`,
            type: "group" as const,
            name: groupName,
            workType,
            discipline: typedDiscipline,
            children: majorNodes,
            sortOrder: groupIndex,
          };
        });

        return {
          id: `${workType}:${disciplineId}`,
          parentId: workType,
          type: "discipline" as const,
          name: disciplineLabel,
          workType,
          discipline: typedDiscipline,
          children: groupNodes,
          sortOrder: disciplineIndex,
        };
      })
      .filter((node): node is NonNullable<typeof node> => Boolean(node)) as CostTreeNode[];

    return {
      id: workType,
      parentId: null,
      type: "module" as const,
      name: workTypeLabels[workType],
      workType,
      children: disciplineNodes,
      sortOrder: workTypeIndex,
    };
  });
}

function majorItemToNode(item: CostMajorItem, parentId: string, sortOrder: number): CostTreeNode {
  return {
    id: `${parentId}:${item.id}`,
    parentId,
    type: "majorItem",
    name: item.name,
    code: item.id,
    unit: item.unit,
    description: item.description,
    workType: item.workTypes[0],
    discipline: item.discipline,
    majorItemId: item.id,
    children: item.detailLines.map((detail, index) => detailLineToNode(detail, `${parentId}:${item.id}`, item, index)),
    sortOrder,
  };
}

function detailLineToNode(detail: CostDetailLine, parentId: string, item: CostMajorItem, sortOrder: number): CostTreeNode {
  return {
    id: `${parentId}:${detail.id}`,
    parentId,
    type: "detailItem",
    name: detail.name,
    code: detail.id,
    unit: detail.unit,
    description: detail.note,
    workType: item.workTypes[0],
    discipline: item.discipline,
    majorItemId: item.id,
    detailLineId: detail.id,
    children: [],
    sortOrder,
  };
}

export function flattenCostTree(nodes: CostTreeNode[]): CostTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenCostTree(node.children)]);
}

export function findCostTreeNode(nodes: CostTreeNode[], id: string): CostTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findCostTreeNode(node.children, id);
    if (found) return found;
  }
  return undefined;
}

export function getFirstMajorItemNode(nodes: CostTreeNode[]): CostTreeNode | undefined {
  return flattenCostTree(nodes).find((node) => node.type === "majorItem");
}
