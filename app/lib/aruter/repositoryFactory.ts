import { aruterDatabaseRepository } from "./databaseRepository";
import type { AruterRepository } from "./repositoryTypes";
import { aruterRepository as aruterMockRepository } from "./serverRepository";

export type AruterRepositoryMode = "mock" | "database";

export function getAruterRepositoryMode(): AruterRepositoryMode {
  const mode = process.env.ARUTER_REPOSITORY_MODE;

  if (mode === "database") return "database";
  return "mock";
}

export function getAruterRepository(): AruterRepository {
  const mode = getAruterRepositoryMode();

  if (mode === "database") {
    return aruterDatabaseRepository;
  }

  return aruterMockRepository;
}

export function isAruterDatabaseMode() {
  return getAruterRepositoryMode() === "database";
}
