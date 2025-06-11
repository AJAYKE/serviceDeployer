// repo_deployer_ui_backend/app/page.tsx

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<any>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("root");
  const router = useRouter();

  useEffect(() => {
    const t = localStorage.getItem("accessToken");
    if (!t) return router.push("/signin");
    setToken(t);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch("https://api.github.com/user/repos", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then(setRepos);
  }, [token]);

  const handleRepoClick = (repo: any) => {
    setSelectedRepo(repo);
    fetch(
      `https://api.github.com/repos/${repo.owner.login}/${repo.name}/contents`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then((res) => res.json())
      .then((data) => {
        const dirs = data
          .filter((f: any) => f.type === "dir")
          .map((f: any) => f.name);
        setFolders([". (select if root folder)", ...dirs]);
      });
  };

  const handleDeploy = async () => {
    if (!selectedRepo || !selectedFolder) return;
    const res = await fetch("http://localhost:8080/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo: selectedRepo.full_name,
        service: selectedFolder,
      }),
    });
    if (res.ok) alert("Deployment triggered!");
    else alert("Failed to deploy.");
  };

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Repositories</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96 pr-4">
            {repos.map((repo) => (
              <div
                key={repo.id}
                className="cursor-pointer hover:bg-gray-100 p-2 rounded"
                onClick={() => handleRepoClick(repo)}
              >
                {repo.full_name}
              </div>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>

      {selectedRepo && (
        <Card>
          <CardHeader>
            <CardTitle>Folders in {selectedRepo.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96 pr-4">
              {folders.map((folder) => (
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
              ))}
              <Button onClick={handleDeploy} className="mt-4">
                Deploy Selected
              </Button>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
