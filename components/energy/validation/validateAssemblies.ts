import type { EnergyAssemblyValidationMessage } from "@/components/energy/domain/energyAssemblyTypes";
import type { SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";

export function validateAssemblyDefinition(assembly: SurveyConstructionAssembly): EnergyAssemblyValidationMessage[] {
  const messages: EnergyAssemblyValidationMessage[] = [];
  const base = { assemblyId: assembly.id, assemblyName: assembly.name };
  if (!assembly.name.trim()) messages.push({ ...base, code: "ASSEMBLY_NAME_REQUIRED", severity: "error", blocking: true, field: "name", message: `A(z) ${assembly.id} rétegrend neve hiányzik.` });
  if (!assembly.layers.length) messages.push({ ...base, code: "NO_LAYERS", severity: "error", blocking: true, field: "layers", message: `${assembly.name}: legalább egy réteg szükséges.` });
  if (assembly.complexity === "inhomogeneous") messages.push({ ...base, code: "INHOMOGENEOUS_REQUIRES_DETAILED_METHOD", severity: "error", blocking: true, field: "complexity", message: `${assembly.name}: inhomogén rétegnél felső és alsó hővezetési ellenállási határérték vagy numerikus modell szükséges; a homogén rétegrendi motor nem alkalmazható.` });
  if (assembly.complexity === "variableThicknessAverage") messages.push({ ...base, code: "VARIABLE_THICKNESS_AVERAGE_WARNING", severity: "warning", blocking: false, field: "complexity", message: `${assembly.name}: a változó vastagságú réteg átlagos vastagsággal számolódik. 5%-nál nagyobb lejtésnél numerikus modellezés szükséges.` });

  if (assembly.calculationMode === "declared") {
    const declared = Number(String(assembly.declaredUValueWm2K || "").replace(",", "."));
    if (!(declared > 0)) messages.push({ ...base, code: "DECLARED_U_VALUE_INVALID", severity: "error", blocking: true, field: "declaredUValueWm2K", message: `${assembly.name}: deklarált módban pozitív U-érték szükséges.` });
    if (!assembly.declaredUValueSource?.trim()) messages.push({ ...base, code: "DECLARED_U_SOURCE_REQUIRED", severity: "error", blocking: true, field: "declaredUValueSource", message: `${assembly.name}: a deklarált U-érték forrását meg kell adni.` });
  }
  if (assembly.surfaceResistanceMode === "custom") {
    const rsi = Number(String(assembly.customRsiM2KPerW || "").replace(",", "."));
    const rse = Number(String(assembly.customRseM2KPerW || "").replace(",", "."));
    if (!(rsi >= 0) || !(rse >= 0) || (!String(assembly.customRsiM2KPerW).trim() || !String(assembly.customRseM2KPerW).trim())) messages.push({ ...base, code: "CUSTOM_SURFACE_RESISTANCE_INVALID", severity: "error", blocking: true, field: "surfaceResistanceMode", message: `${assembly.name}: egyedi felületi ellenállásnál nemnegatív Rsi és Rse érték szükséges.` });
  }
  if (assembly.corrections.invertedRoofDeltaUWm2K > 0 && !assembly.corrections.invertedRoofSource.trim()) messages.push({ ...base, code: "INVERTED_ROOF_SOURCE_REQUIRED", severity: "error", blocking: true, field: "corrections.invertedRoofSource", message: `${assembly.name}: fordított tető korrekcióhoz az MSZ EN ISO 6946 szerinti számítás vagy forrás megadása kötelező.` });
  return messages;
}
