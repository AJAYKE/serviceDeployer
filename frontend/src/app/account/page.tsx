/* eslint-disable @next/next/no-img-element */
// repo_deployer_ui_backend/app/account/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface UserData {
  username: string;
  email: string;
  avatar: string;
  githubId: string;
}

export default function AccountPage() {
  const [token, setToken] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const router = useRouter();

  useEffect(() => {
    const t = localStorage.getItem("accessToken");
    if (!t) return router.push("/signin");
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    // In a real app, you'd have an API endpoint to get user profile from your DB
    // For now, we'll simulate by decoding the GitHub token or making a direct GitHub API call
    // A better approach is to have a backend endpoint like /api/user-profile
    fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/signin");
          }
          throw new Error("Failed to fetch user data");
        }
        return res.json();
      })
      .then((data) => {
        setUserData({
          username: data.login,
          email: data.email, // Note: GitHub API might not return public email unless scope allows
          avatar: data.avatar_url,
          githubId: data.id.toString(),
        });
      })
      .catch((error) => console.error("Error fetching user data:", error));
  }, [token, router]);

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    router.push("/signin");
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Account</h1>
        <div className="space-x-4">
          <Link href="/" passHref>
            <Button variant="outline">Deploy New</Button>
          </Link>
          <Link href="/projects" passHref>
            <Button variant="outline">My Projects</Button>
          </Link>
        </div>
      </div>

      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {userData ? (
            <>
              {userData.avatar && (
                <img
                  src={userData.avatar}
                  alt="User Avatar"
                  className="w-24 h-24 rounded-full mx-auto"
                />
              )}
              <p>**Username:** {userData.username || "N/A"}</p>
              <p>**Email:** {userData.email || "Not publicly available"}</p>
              <p>**GitHub ID:** {userData.githubId || "N/A"}</p>
              <Button
                onClick={handleLogout}
                className="w-full mt-6"
                variant="destructive"
              >
                Logout
              </Button>
            </>
          ) : (
            <p>Loading user data...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
