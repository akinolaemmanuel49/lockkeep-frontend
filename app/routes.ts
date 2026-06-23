import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("login", "routes/login.tsx"),
    route("signup", "routes/signup.tsx"),
    route("setup", "routes/setup.tsx"),
    route("dashboard", "routes/dashboard.tsx"),
    route("settings", "routes/settings.tsx"),
    route("callback", "routes/callback.tsx"),
    route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
