import SerialMonitorClient from "./serial-monitor-client";

type PageProps = {
  params: Promise<{
    deviceId: string;
  }>;
};

export default async function AdminDeviceSerialMonitorPage({
  params,
}: PageProps) {
  const { deviceId } = await params;

  return <SerialMonitorClient deviceId={deviceId} />;
}
