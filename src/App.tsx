import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SalesPage from './pages/sales/SalesPage'
import NewSalePage from './pages/sales/NewSalePage'
import ProductsPage from './pages/catalog/ProductsPage'
import CustomersPage from './pages/customers/CustomersPage'
import SuppliersPage from './pages/suppliers/SuppliersPage'
import StockPage from './pages/stock/StockPage'
import InvoicingPage from './pages/invoicing/InvoicingPage'
import ReportingPage from './pages/reporting/ReportingPage'
import BackupPage from './pages/backup/BackupPage'
import UsersPage from './pages/auth/UsersPage'
import ParametersPage from './pages/parameters/ParametersPage'
import { HiddenOptionsProvider } from './context/HiddenOptionsContext'

export default function App() {
  return (
    <HiddenOptionsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="sales" element={<SalesPage />} />
            <Route path="sales/new" element={<NewSalePage />} />
            <Route path="catalog" element={<ProductsPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="stock" element={<StockPage />} />
            <Route path="invoicing" element={<InvoicingPage />} />
            <Route path="reporting" element={<ReportingPage />} />
            <Route path="backup" element={<BackupPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="parameters" element={<ParametersPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </HiddenOptionsProvider>
  )
}
