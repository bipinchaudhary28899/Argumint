import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { LoginInput } from "@argumint/shared";

export function Login() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  const [formData, setFormData] = useState<LoginInput>({
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.email) {
      errs.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errs.email = "Invalid email format";
    }

    if (!formData.password) {
      errs.password = "Password is required";
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    try {
      await login(formData);
      navigate("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-12 space-y-8 border-4 border-indigo-500">
        <div className="text-center">
          <h1 className="text-5xl font-black text-indigo-600 drop-shadow-lg">Argumint</h1>
          <p className="mt-3 text-lg font-semibold text-purple-600">
            Sign in to continue debating
          </p>
          <div className="mt-4 h-1 w-20 bg-indigo-500 mx-auto rounded-full"></div>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-xl bg-red-100 border-2 border-red-500 p-5 shadow-md">
              <div className="text-sm font-bold text-red-800">⚠️ {error}</div>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-bold text-gray-800 uppercase tracking-wide"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                className={`mt-2 appearance-none block w-full px-4 py-3 border-2 rounded-lg shadow-md placeholder-gray-400
                  focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:border-indigo-600 sm:text-sm transition font-semibold
                  ${
                    fieldErrors.email ? "border-red-400 bg-red-50" : "border-gray-300 bg-gray-50"
                  }`}
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
              />
              {fieldErrors.email && (
                <p className="mt-2 text-sm font-bold text-red-600">
                  ❌ {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-bold text-gray-800 uppercase tracking-wide"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className={`mt-2 appearance-none block w-full px-4 py-3 border-2 rounded-lg shadow-md placeholder-gray-400
                  focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:border-indigo-600 sm:text-sm transition font-semibold
                  ${
                    fieldErrors.password ? "border-red-400 bg-red-50" : "border-gray-300 bg-gray-50"
                  }`}
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
              />
              {fieldErrors.password && (
                <p className="mt-2 text-sm font-bold text-red-600">
                  ❌ {fieldErrors.password}
                </p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-base font-bold
                rounded-lg text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700
                focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition duration-150 shadow-lg"
            >
              {isLoading ? "⏳ Signing in..." : "✨ Sign in"}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-700 font-semibold">
              Don't have an account?{" "}
              <Link
                to="/register"
                className="font-bold text-indigo-600 hover:text-purple-600 underline decoration-2"
              >
                Sign up here
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
