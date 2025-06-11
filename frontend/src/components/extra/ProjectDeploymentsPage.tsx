"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Deployment {
  id: string;
  projectId: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  createdAt: string;
  updatedAt: string;
}

export default function ProjectDeploymentsPage({
  projectId,
}: {
  projectId: string;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [projectName, setProjectName] = useState<string>("");
  const router = useRouter();

  useEffect(() => {
    const t = localStorage.getItem("accessToken");
    if (!t) return router.push("/signin");
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token || !projectId) return;

    fetch(`http://localhost:8080/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const project = data.find((p: any) => p.id === projectId);
        if (project) {
          setProjectName(project.name);
        }
      })
      .catch((error) => console.error("Error fetching project name:", error));

    fetch(`http://localhost:8080/api/projects/${projectId}/deployments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/signin");
          }
          throw new Error("Failed to fetch deployments");
        }
        return res.json();
      })
      .then(setDeployments)
      .catch((error) => console.error("Error fetching deployments:", error));
  }, [token, projectId, router]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Deployments for {projectName}</h1>
        <div className="space-x-4">
          <Link href="/" passHref>
            <Button variant="outline">Deploy New</Button>
          </Link>
          <Link href="/projects" passHref>
            <Button variant="outline">My Projects</Button>
          </Link>
          <Link href="/account" passHref>
            <Button variant="outline">Account</Button>
          </Link>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-180px)] pr-4">
        {deployments.length === 0 ? (
          <p>No deployments found for this project.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {deployments.map((deployment) => (
              <Card key={deployment.id}>
                <CardHeader>
                  <CardTitle>Deployment ID: {deployment.id}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>
                    <strong>Status:</strong>{" "}
                    <Badge
                      className={
                        deployment.status === "SUCCESS"
                          ? "bg-green-500"
                          : deployment.status === "FAILED"
                          ? "bg-red-500"
                          : "bg-yellow-500"
                      }
                    >
                      {deployment.status}
                    </Badge>
                  </p>
                  <p>
                    <strong>Started At:</strong>{" "}
                    {new Date(deployment.createdAt).toLocaleString()}
                  </p>
                  <p>
                    <strong>Last Updated:</strong>{" "}
                    {new Date(deployment.updatedAt).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
