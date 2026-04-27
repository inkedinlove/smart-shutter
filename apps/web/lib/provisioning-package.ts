import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type { RegisteredDevice } from "@/lib/devices";
import {
  buildProvisioningPackageFileName,
  buildProvisioningPackageReadme,
  getProvisioningDownloadInfo,
  type ProvisioningWifiMode,
} from "@/lib/provisioning";
import { buildZipArchive } from "@/lib/zip";

type ProvisioningPackageInput = {
  configText: string;
  device: RegisteredDevice;
  provisioningCode?: string | null;
  wifiMode: ProvisioningWifiMode;
  wifiSsid: string;
};

const PROVISIONING_ASSET_ROOTS = [
  path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "public",
    "provisioning-assets",
  ),
  path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "apps",
    "web",
    "public",
    "provisioning-assets",
  ),
];

async function resolveProvisioningAssetPath(
  sketchDirName: string,
  fileName: string,
): Promise<string> {
  for (const assetRoot of PROVISIONING_ASSET_ROOTS) {
    const candidatePath = path.join(assetRoot, sketchDirName, fileName);

    try {
      await access(candidatePath);
      return candidatePath;
    } catch {
      continue;
    }
  }

  throw new Error(
    `Missing staged provisioning asset ${sketchDirName}/${fileName}. Run scripts/package-firmware-downloads.ps1 before deploying.`,
  );
}

async function readProvisioningAsset(
  sketchDirName: string,
  fileName: string,
): Promise<Buffer> {
  const assetPath = await resolveProvisioningAssetPath(sketchDirName, fileName);
  return readFile(assetPath);
}

export async function buildProvisioningPackage(input: ProvisioningPackageInput): Promise<{
  buffer: Buffer;
  fileName: string;
}> {
  const downloadInfo = getProvisioningDownloadInfo(input.device.board);
  const sketchFile = await readProvisioningAsset(
    downloadInfo.sketchDirName,
    downloadInfo.mainSketchFile,
  );
  const configExampleFile = await readProvisioningAsset(
    downloadInfo.sketchDirName,
    "config.example.h",
  );
  const readmeText = buildProvisioningPackageReadme({
    device: input.device,
    provisioningCode: input.provisioningCode,
    wifiMode: input.wifiMode,
    wifiSsid: input.wifiSsid,
  });

  const buffer = buildZipArchive([
    {
      name: "README.txt",
      data: readmeText,
    },
    {
      name: `${downloadInfo.sketchDirName}/${downloadInfo.mainSketchFile}`,
      data: sketchFile,
    },
    {
      name: `${downloadInfo.sketchDirName}/config.example.h`,
      data: configExampleFile,
    },
    {
      name: `${downloadInfo.sketchDirName}/config.h`,
      data: input.configText,
    },
  ]);

  return {
    buffer,
    fileName: buildProvisioningPackageFileName(
      input.device.deviceId,
      input.device.board,
    ),
  };
}
