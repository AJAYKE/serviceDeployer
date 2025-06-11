import axiosInstance from "@/lib/axios";

const signIn = async () => {
  try {
    const response = await axiosInstance.post("/auth/signin", {});
    return response.data;
  } catch (error) {
    console.error("Error signing in:", error);
    throw error;
  }
};
