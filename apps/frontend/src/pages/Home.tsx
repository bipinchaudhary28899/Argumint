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
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">Argumint</h1>
            </div>
            <div className="flex items-center space-x-4">
              {user && (
                <>
                  <span className="text-gray-700">{user.email}</span>
                  <button
                    onClick={handleLogout}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                  >
                    {isLoading ? "Logging out..." : "Logout"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Welcome to Argumint 2.0
            </h2>
            <p className="text-gray-600">
              You are successfully logged in as <strong>{user?.email}</strong>
            </p>
            <p className="text-gray-600 mt-2">
              This is a placeholder home page. Build your application here!
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
