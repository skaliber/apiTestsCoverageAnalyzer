import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CoverageProvider } from './context/CoverageContext';
import { SettingsProvider } from './context/SettingsContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import OverviewPage from './pages/OverviewPage';
import EndpointsPage from './pages/EndpointsPage';
import ParametersPage from './pages/ParametersPage';
import BusinessRulesPage from './pages/BusinessRulesPage';
import IntegrationFlowsPage from './pages/IntegrationFlowsPage';
import SecurityPage from './pages/SecurityPage';
import ErrorHandlingPage from './pages/ErrorHandlingPage';
import PerformancePage from './pages/PerformancePage';
import TrendsPage from './pages/TrendsPage';
import CoverageIntelligencePage from './pages/CoverageIntelligencePage';

export default function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <CoverageProvider>
          <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
            <Sidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <Header />
              <main className="flex-1 overflow-auto">
                <Routes>
                  <Route path="/" element={<OverviewPage />} />
                  <Route path="/endpoints" element={<EndpointsPage />} />
                  <Route path="/parameters" element={<ParametersPage />} />
                  <Route path="/business-rules" element={<BusinessRulesPage />} />
                  <Route path="/integration-flows" element={<IntegrationFlowsPage />} />
                  <Route path="/security" element={<SecurityPage />} />
                  <Route path="/error-handling" element={<ErrorHandlingPage />} />
                  <Route path="/performance" element={<PerformancePage />} />
                  <Route path="/trends" element={<TrendsPage />} />
                  <Route path="/intelligence" element={<CoverageIntelligencePage />} />
                </Routes>
              </main>
            </div>
          </div>
        </CoverageProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}
