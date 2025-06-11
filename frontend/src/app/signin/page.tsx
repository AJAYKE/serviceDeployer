"use client";
import { Button } from "@/components/ui/button";

const SignIn = () => {
  const handleLogin = () => {
    window.location.href = "http://localhost:8080/auth/github";
  };

  return (
    <div className="flex items-center justify-center h-screen">
      <Button
        onClick={handleLogin}
        className="bg-black text-white hover:bg-gray-800"
      >
        Sign in with GitHub
      </Button>
    </div>
  );
};

export default SignIn;
