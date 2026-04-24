import FirmwareConsole from "@/app/firmware/firmware-console";

export const dynamic = "force-dynamic";

function isExperimentalOtaUiEnabled(): boolean {
  return process.env.ENABLE_EXPERIMENTAL_OTA_UI?.trim().toLowerCase() === "true";
}

export default function FirmwarePage() {
  return (
    <FirmwareConsole
      experimentalOtaUiEnabled={isExperimentalOtaUiEnabled()}
    />
  );
}
