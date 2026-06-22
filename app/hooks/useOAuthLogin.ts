import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../providers/auth";
import { mockOAuthLogin } from "~/lib/api";

export function useOAuthLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { login } = useAuth();

  const handleOAuth = async (provider: "google" | "github") => {
    setError("");
    setIsLoading(true);

    try {
      const result = await mockOAuthLogin(provider);

      login(result.user);
      navigate("/setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OAuth failed");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    handleOAuth,
    isLoading,
    error,
  };
}
