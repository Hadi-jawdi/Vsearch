import { useState } from "react";

export default function UserAccount() {
  // State to track which form is active: 'login', 'register', or 'forgotPassword'
  const [activeForm, setActiveForm] = useState<"login" | "register" | "forgotPassword">("login");

  // State for login form inputs
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // State for registration form inputs
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");

  // State for forgot password form input
  const [forgotEmail, setForgotEmail] = useState("");

  // Handler for login form submission
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement login logic here
    alert(`Logging in with email: ${loginEmail}`);
  };

  // Handler for registration form submission
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement registration logic here
    if (registerPassword !== registerConfirmPassword) {
      alert("Passwords do not match");
      return;
    }
    alert(`Registering user: ${registerName} with email: ${registerEmail}`);
  };

  // Handler for forgot password form submission
  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement forgot password logic here
    alert(`Password reset link sent to: ${forgotEmail}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      {/* Container for the user account forms */}
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        {/* Navigation tabs for switching between forms */}
        <div className="flex justify-around mb-6">
          <button
            className={`px-4 py-2 font-semibold rounded ${activeForm === "login" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}
            onClick={() => setActiveForm("login")}
            aria-label="Login form"
          >
            Login
          </button>
          <button
            className={`px-4 py-2 font-semibold rounded ${activeForm === "register" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}
            onClick={() => setActiveForm("register")}
            aria-label="Register form"
          >
            Register
          </button>
          <button
            className={`px-4 py-2 font-semibold rounded ${activeForm === "forgotPassword" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}
            onClick={() => setActiveForm("forgotPassword")}
            aria-label="Forgot password form"
          >
            Forgot Password
          </button>
        </div>

        {/* Login Form */}
        {activeForm === "login" && (
          <form onSubmit={handleLoginSubmit} className="space-y-4" aria-label="Login form">
            {/* Email input */}
            <div>
              <label htmlFor="loginEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Email
              </label>
              <input
                type="email"
                id="loginEmail"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50 dark:bg-gray-700 dark:text-white"
                placeholder="you@example.com"
              />
            </div>

            {/* Password input */}
            <div>
              <label htmlFor="loginPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Password
              </label>
              <input
                type="password"
                id="loginPassword"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50 dark:bg-gray-700 dark:text-white"
                placeholder="Your password"
              />
            </div>

            {/* Remember me checkbox */}
            <div className="flex items-center mt-2">
              <input
                id="rememberMe"
                type="checkbox"
                className="h-5 w-5 text-blue-600 border-2 border-gray-400 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              />
              <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                Remember me
              </label>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              className="w-full py-2 px-4 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition-colors"
            >
              Log In
            </button>
          </form>
        )}

        {/* Register Form */}
        {activeForm === "register" && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4" aria-label="Register form">
            {/* Name input */}
            <div>
              <label htmlFor="registerName" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Name
              </label>
              <input
                type="text"
                id="registerName"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50 dark:bg-gray-700 dark:text-white"
                placeholder="Your full name"
              />
            </div>

            {/* Email input */}
            <div>
              <label htmlFor="registerEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Email
              </label>
              <input
                type="email"
                id="registerEmail"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50 dark:bg-gray-700 dark:text-white"
                placeholder="you@example.com"
              />
            </div>

            {/* Password input */}
            <div>
              <label htmlFor="registerPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Password
              </label>
              <input
                type="password"
                id="registerPassword"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50 dark:bg-gray-700 dark:text-white"
                placeholder="Create a password"
              />
            </div>

            {/* Confirm Password input */}
            <div>
              <label htmlFor="registerConfirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Confirm Password
              </label>
              <input
                type="password"
                id="registerConfirmPassword"
                value={registerConfirmPassword}
                onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50 dark:bg-gray-700 dark:text-white"
                placeholder="Confirm your password"
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              className="w-full py-2 px-4 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition-colors"
            >
              Register
            </button>
          </form>
        )}

        {/* Forgot Password Form */}
        {activeForm === "forgotPassword" && (
          <form onSubmit={handleForgotSubmit} className="space-y-4" aria-label="Forgot password form">
            {/* Email input */}
            <div>
              <label htmlFor="forgotEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Email
              </label>
              <input
                type="email"
                id="forgotEmail"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50 dark:bg-gray-700 dark:text-white"
                placeholder="you@example.com"
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              className="w-full py-2 px-4 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition-colors"
            >
              Send Reset Link
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
