import type { DropAdminRepositoryPort } from "./dropAdminRepositoryPort";
import {
  findDropPackageById,
  issueDropAccessToken,
  reissueDropAccessTokenAtomic,
  revokeActiveDropTokens,
  revokeDropToken,
  revokeDropTokenAtomic,
  transitionDropPackageStatusAtomic,
  updateDropPackageStatus,
  writeDropEvent,
} from "./dropRepository";

export const supabaseDropAdminRepository: DropAdminRepositoryPort = {
  transitionStatusAtomic: transitionDropPackageStatusAtomic,
  reissueTokenAtomic: reissueDropAccessTokenAtomic,
  revokeTokenAtomic: revokeDropTokenAtomic,
  findPackageById: findDropPackageById,
  updatePackageStatus: updateDropPackageStatus,
  revokeActiveTokens: revokeActiveDropTokens,
  revokeToken: revokeDropToken,
  issueAccessToken: issueDropAccessToken,
  writeEvent: writeDropEvent,
};
