import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function Home() {
  const navigate = useNavigate();
  const { user, logout, isLoading } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-2xl font-extrabold text-indigo-600">Argumint</h1>
            <div className="flex items-center space-x-4">
              {user && (
                <>
                  <span className="text-gray-700">{user.email}</span>
                  <button
                    onClick={handleLogout}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md
                      hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2
                      focus:ring-red-500 disabled:opacity-50 transition"
                  >
                    {isLoading ? "Logging out..." : "Logout"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-10 space-y-6 text-center">
          <h1 className="text-4xl font-extrabold text-indigo-600">
            Welcome{user ? `, ${user.email}` : ""}!
          </h1>
          <p className="text-gray-600">
            You are successfully logged in to Argumint 2.0
          </p>
          <p className="text-gray-600">
            Choose an action to get started.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={() => navigate("/debates/new")}
              className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition"
            >
              New Debate
            </button>
            <button
              onClick={() => navigate("/debates")}
              className="px-6 py-3 bg-white border border-indigo-600 text-indigo-600 rounded-md
                hover:bg-indigo-50 transition"
            >
              Browse Debates
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
