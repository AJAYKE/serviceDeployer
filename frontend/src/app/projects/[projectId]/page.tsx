import ProjectDeploymentsPage from "@/components/extra/ProjectDeploymentsPage";
import { use } from "react";

export default function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);

  return <ProjectDeploymentsPage projectId={projectId} />;
}
