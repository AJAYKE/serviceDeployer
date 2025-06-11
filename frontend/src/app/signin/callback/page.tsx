"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function OAuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");

    if (token) {
      localStorage.setItem("accessToken", token);
      router.push("/");
    } else {
      router.push("/signin");
    }
  }, [router]);

  return <p>Logging in with GitHub...</p>;
}
