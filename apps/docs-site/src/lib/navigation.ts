export interface NavItem {
  title: string;
  href: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    title: "Overview",
    items: [
      { title: "Getting Started", href: "/" },
      { title: "Architecture", href: "/architecture" },
      { title: "Project Summary", href: "/overview/project-summary" },
    ],
  },
  {
    title: "Frontend",
    items: [
      { title: "Web App", href: "/frontend/web-app" },
      { title: "Voice Mode", href: "/frontend/voice" },
      { title: "Admin Panel", href: "/frontend/admin-panel" },
    ],
  },
  {
    title: "Backend",
    items: [
      { title: "Backend Architecture", href: "/backend/architecture" },
      { title: "WebSocket Protocol", href: "/backend/websocket" },
      { title: "Data Model", href: "/backend/data-model" },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Deployment", href: "/operations/deployment" },
      { title: "Testing", href: "/operations/testing" },
      { title: "Development Setup", href: "/operations/development" },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "API Reference", href: "/reference/api" },
      { title: "Configuration", href: "/reference/configuration" },
      { title: "All Documentation", href: "/reference/all-docs" },
    ],
  },
];
