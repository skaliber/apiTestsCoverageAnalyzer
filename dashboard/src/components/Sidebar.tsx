import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: '📊 Overview' },
  { to: '/endpoints', label: '🔗 Endpoints' },
  { to: '/parameters', label: '🔧 Parameters' },
  { to: '/business-rules', label: '📋 Business Rules' },
  { to: '/integration-flows', label: '🔄 Integration Flows' },
  { to: '/security', label: '🔒 Security' },
  { to: '/error-handling', label: '⚠️ Error Handling' },
  { to: '/performance', label: '⚡ Performance' },
  { to: '/trends', label: '📈 Trends' },
];

export default function Sidebar() {
  return (
    <nav className="w-64 min-h-screen bg-gray-900 dark:bg-gray-950 text-white flex flex-col py-6 px-3 shrink-0">
      <div className="text-lg font-bold mb-8 px-3 text-blue-400">API Coverage</div>
      <ul className="flex flex-col gap-1">
        {navItems.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
