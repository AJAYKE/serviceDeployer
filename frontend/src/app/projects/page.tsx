// repo_deployer_ui_backend/app/projects/page.tsx
"use client";

import { Badge } from "@/components/ui/badge"; // Assuming you have a Badge component
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Project {
  id: string;
  name: string;
  repo: string;
  createdAt: string;
  Deployment: Deployment[];
}

interface Deployment {
  id: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  createdAt: string;
}

export default function ProjectsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const router = useRouter();

  useEffect(() => {
    const t = localStorage.getItem("accessToken");
    if (!t) return router.push("/signin");
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    fetch("http://localhost:8080/api/projects", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/signin");
          }
          throw new Error("Failed to fetch projects");
        }
        return res.json();
      })
      .then(setProjects)
      .catch((error) => console.error("Error fetching projects:", error));
  }, [token, router]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Projects</h1>
        <div className="space-x-4">
          <Link href="/" passHref>
            <Button variant="outline">Deploy New</Button>
          </Link>
          <Link href="/account" passHref>
            <Button variant="outline">Account</Button>
          </Link>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-180px)] pr-4">
        {projects.length === 0 ? (
          <p>You have no projects yet. Deploy one to get started!</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Card key={project.id}>
                <CardHeader>
                  <CardTitle>{project.name}</CardTitle>
                  <p className="text-sm text-gray-500">{project.repo}</p>
                </CardHeader>
                <CardContent>
                  <h3 className="text-md font-semibold mb-2">
                    Latest Deployments:
                  </h3>
                  {project.Deployment && project.Deployment.length > 0 ? (
                    <ul className="space-y-2">
                      {project.Deployment.slice(0, 3).map(
                        (
                          deployment // Show last 3 deployments
                        ) => (
                          <li
                            key={deployment.id}
                            className="flex justify-between items-center"
                          >
                            <span className="text-sm">
                              {new Date(deployment.createdAt).toLocaleString()}
                            </span>
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
                          </li>
                        )
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No deployments yet.</p>
                  )}
                  <Link href={`/projects/${project.id}`} passHref>
                    <Button variant="link" className="mt-4 p-0">
                      View All Deployments
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
