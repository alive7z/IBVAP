import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EyeIcon, EyeOffIcon } from "../components/common/Icons";
import Modal from "../components/common/Modal";
import Logo from "../components/common/Logo";
import { useAuth } from "../hooks/useAuth";
import {
  useLanguage,
  SUPPORTED_LANGUAGES,
} from "../hooks/useLanguage";

function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const {
    login,
    isAuthenticated,
    isChecking,
    isLoading,
  } = useAuth();

  const { lang, setLang } = useLanguage();

  const [values, setValues] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    if (isChecking || isLoading) return;

    if (isAuthenticated) {
      const redirect = params.get("redirect");

      navigate(
        redirect
          ? decodeURIComponent(redirect)
          : "/dashboard",
        { replace: true }
      );
    }
  }, [
    isAuthenticated,
    isChecking,
    isLoading,
    navigate,
    params,
  ]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setValues((current) => ({
      ...current,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (!values.email || !values.password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const user = await login({
        email: values.email,
        password: values.password,
      });

      if (user) {
        const redirect = params.get("redirect");

        navigate(
          redirect
            ? decodeURIComponent(redirect)
            : "/dashboard",
          { replace: true }
        );
      }
    } catch (err) {
      setError(
        err?.message || "Invalid email or password."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f6ff] px-5 py-12">
      {/* Soft background glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[650px] w-[650px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-200/20 blur-[130px]"
        aria-hidden="true"
      />

      {/* Language selector */}
      <div className="absolute right-5 top-5 flex items-center gap-1.5 sm:right-8 sm:top-8">
        {SUPPORTED_LANGUAGES.map((language) => (
          <button
            key={language.code}
            type="button"
            onClick={() => setLang(language.code)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              lang === language.code
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-white hover:text-blue-600"
            }`}
          >
            {language.label}
          </button>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-[640px]">
        {/* Logo */}
        <div className="mb-10 flex justify-center">
          <div className="transition duration-300 hover:scale-105">
            <Logo
              size={58}
              rounded={false}
            />
          </div>
        </div>

        {/* Login Card */}
        <section className="rounded-2xl border border-slate-100 bg-white px-6 py-10 shadow-[0_20px_60px_rgba(37,99,235,0.08)] sm:px-12 sm:py-14">
          {/* Heading */}
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-[#294e7d] sm:text-[34px]">
              Welcome Back
            </h1>

            <p className="mt-3 text-sm text-slate-400 sm:text-base">
              Enter your credentials to access your account.
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="mt-12"
            noValidate
          >
            <div className="space-y-7">
              {/* Email */}
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-6">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-5 w-5 text-blue-500 transition group-focus-within:text-blue-600"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 6.75h16v10.5H4V6.75Z"
                      fill="currentColor"
                    />

                    <path
                      d="m4.75 7.5 7.25 5 7.25-5"
                      stroke="white"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                <input
                  id="email"
                  name="email"
                  type="email"
                  value={values.email}
                  onChange={handleChange}
                  autoComplete="email"
                  placeholder="Enter your email"
                  className="h-16 w-full rounded-xl border border-slate-200 bg-white pl-16 pr-5 text-[15px] text-[#294e7d] outline-none transition duration-200 placeholder:text-slate-400 hover:border-blue-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              {/* Password */}
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-6">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-5 w-5 text-blue-500 transition group-focus-within:text-blue-600"
                    aria-hidden="true"
                  >
                    <rect
                      x="5"
                      y="10"
                      width="14"
                      height="10"
                      rx="2"
                      fill="currentColor"
                    />

                    <path
                      d="M8 10V7.5a4 4 0 0 1 8 0V10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />

                    <circle
                      cx="12"
                      cy="15"
                      r="1.2"
                      fill="white"
                    />
                  </svg>
                </div>

                <input
                  id="password"
                  name="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={values.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="h-16 w-full rounded-xl border border-slate-200 bg-white pl-16 pr-14 text-[15px] text-[#294e7d] outline-none transition duration-200 placeholder:text-slate-400 hover:border-blue-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (current) => !current
                    )
                  }
                  className="absolute inset-y-0 right-0 flex items-center px-5 text-slate-400 transition hover:text-blue-600 focus:outline-none"
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOffIcon size={19} />
                  ) : (
                    <EyeIcon size={19} />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="mt-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"
              >
                {error}
              </div>
            )}

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="mt-8 flex h-16 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-base font-semibold text-white shadow-[0_10px_25px_rgba(37,99,235,0.20)] transition duration-200 hover:-translate-y-0.5 hover:from-blue-600 hover:to-blue-700 hover:shadow-[0_14px_30px_rgba(37,99,235,0.28)] focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {loading ? (
                <div className="flex items-center gap-3">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Signing In...
                </div>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </section>

        {/* Forgot Password */}
        <div className="mt-10 text-center text-sm sm:text-base">
          <span className="text-slate-400">
            Forgot your password?{" "}
          </span>

          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="font-medium text-blue-500 transition hover:text-blue-700"
          >
            Reset Password
          </button>
        </div>

        {/* Platform name */}
        <div className="mt-7 text-center">
          <p className="text-xs font-medium tracking-wide text-slate-300">
            IBVAP · Intelligent Border Video Analytics Platform
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Reset Password"
      >
        <p className="text-sm leading-6 text-slate-600">
          Password resets are handled by the platform
          administrator. Please contact the National Border
          Command Centre help desk to reset your password.
        </p>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          Self-service password reset will be available after
          the authentication backend is fully configured.
        </p>
      </Modal>
    </main>
  );
}

export default Login;