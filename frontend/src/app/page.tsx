/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input"; // Import Input component
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link"; // For navigation links
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<any>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>(".");
  const [projectName, setProjectName] = useState<string>(""); // New state for project name
  const router = useRouter();

  useEffect(() => {
    const t = localStorage.getItem("accessToken");
    if (!t) return router.push("/signin");
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    // Fetch repositories from your backend
    fetch("http://localhost:8080/api/repos", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/signin"); // Redirect to signin if token is invalid
          }
          throw new Error("Failed to fetch repositories");
        }
        return res.json();
      })
      .then(setRepos)
      .catch((error) => console.error("Error fetching repos:", error));
  }, [token, router]);

  const handleRepoClick = (repo: any) => {
    setSelectedRepo(repo);
    setProjectName(repo.name); // Pre-fill project name with repo name
    // Fetch contents from your backend
    fetch(
      `http://localhost:8080/api/repos/${repo.owner.login}/${repo.name}/contents`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch repository contents");
        return res.json();
      })
      .then((data) => {
        const dirs = data
          .filter((f: any) => f.type === "dir")
          .map((f: any) => f.name);
        setFolders([". (select if root folder)", ...dirs]);
        setSelectedFolder("."); // Reset selected folder
      })
      .catch((error) => console.error("Error fetching folders:", error));
  };

  const handleDeploy = async () => {
    if (!selectedRepo || !selectedFolder || !projectName.trim()) {
      alert(
        "Please select a repository, a folder, and provide a project name."
      );
      return;
    }
    const servicePath =
      selectedFolder === ". (select if root folder)" ? "." : selectedFolder;

    const res = await fetch("http://localhost:8080/deploy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        repo: selectedRepo.full_name,
        service: servicePath,
        projectName: projectName.trim(),
      }),
    });
    if (res.ok) {
      alert("Deployment triggered!");
      const data = await res.json();
      router.push(`/projects/${data.projectId}`); // Navigate to the new project's page
    } else {
      alert("Failed to deploy.");
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Deploy New Service</h1>
        <div className="space-x-4">
          <Link href="/projects" passHref>
            <Button variant="outline">My Projects</Button>
          </Link>
          <Link href="/account" passHref>
            <Button variant="outline">Account</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Repositories</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96 pr-4">
              {repos.length === 0 ? (
                <p>No repositories found or still loading...</p>
              ) : (
                repos.map((repo) => (
                  <div
                    key={repo.id}
                    className={`cursor-pointer hover:bg-gray-100 p-2 rounded ${
                      selectedRepo?.id === repo.id ? "bg-gray-200" : ""
                    }`}
                    onClick={() => handleRepoClick(repo)}
                  >
                    {repo.full_name}
                  </div>
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {selectedRepo && (
          <Card>
            <CardHeader>
              <CardTitle>
                Configure Deployment for {selectedRepo.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <label
                  htmlFor="projectName"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Project Name:
                </label>
                <Input
                  id="projectName"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter project name"
                  className="w-full"
                />
              </div>

              <h3 className="text-lg font-semibold mb-2">
                Select Service Folder:
              </h3>
              <ScrollArea className="h-64 pr-4 mb-4">
                {folders.length === 0 ? (
                  <p>No sub-folders found or still loading...</p>
                ) : (
                  folders.map((folder) => (
                    <div
                      key={folder}
                      className={`cursor-pointer p-2 rounded ${
                        selectedFolder === folder
                          ? "bg-black text-white"
                          : "hover:bg-gray-100"
                      }`}
                      onClick={() => setSelectedFolder(folder)}
                    >
                      {folder}
                    </div>
                  ))
                )}
              </ScrollArea>
              <Button onClick={handleDeploy} className="w-full">
                Deploy Selected Service
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
