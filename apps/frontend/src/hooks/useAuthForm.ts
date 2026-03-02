import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import type { RegisterInput, LoginInput } from "@argumint/shared";

export function useAuthForm() {
  const { register, login } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleRegister = async (data: RegisterInput) => {
    try {
      setIsSubmitting(true);
      setErrors({});
      await register(data);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed";
      setErrors({ submit: message });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = async (data: LoginInput) => {
    try {
      setIsSubmitting(true);
      setErrors({});
      await login(data);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      setErrors({ submit: message });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    errors,
    setErrors,
    handleRegister,
    handleLogin,
  };
}
