import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import CajaLayout from './pages/caja/CajaLayout'
import AperturaPage from './pages/caja/AperturaPage'
import CierrePage from './pages/caja/CierrePage'
import MovimientosPage from './pages/caja/MovimientosPage'
import SyncPage from './pages/sync/SyncPage'
import SystemParamsPage from './pages/system-params/SystemParamsPage'
import PedidoReposicionPage from './pages/stock/PedidoReposicionPage'
import RemitoScannerPage from './pages/stock/RemitoScannerPage'
import PrinterSettingsPage from './pages/printer/PrinterSettingsPage'
import LabelsPage from './pages/labels/LabelsPage'
import WebCatalogPage from './pages/web-catalog/WebCatalogPage'
import WebOrdersPage from './pages/web-orders/WebOrdersPage'
import WebProductEditorPage from './pages/web-catalog/WebProductEditorPage'
import WebCategoriesPage from './pages/web-catalog/WebCategoriesPage'
import CambiosPage from './pages/cambios/CambiosPage'
import { HiddenOptionsProvider } from './context/HiddenOptionsContext'

export default function App() {
  return (
    <HiddenOptionsProvider>
      <HashRouter>
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
            <Route path="caja" element={<CajaLayout />}>
              <Route index element={<Navigate to="/caja/apertura" replace />} />
              <Route path="apertura" element={<AperturaPage />} />
              <Route path="cierre" element={<CierrePage />} />
              <Route path="movimientos" element={<MovimientosPage />} />
            </Route>
            <Route path="sync" element={<SyncPage />} />
            <Route path="system-params" element={<SystemParamsPage />} />
            <Route path="stock/pedido" element={<PedidoReposicionPage />} />
            <Route path="stock/remito-scanner" element={<RemitoScannerPage />} />
            <Route path="printer-settings" element={<PrinterSettingsPage />} />
            <Route path="labels" element={<LabelsPage />} />
            <Route path="web-catalog" element={<WebCatalogPage />} />
            <Route path="web-orders" element={<WebOrdersPage />} />
            <Route path="web-catalog/product/:productId" element={<WebProductEditorPage />} />
            <Route path="web-catalog/categories" element={<WebCategoriesPage />} />
            <Route path="cambios" element={<CambiosPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </HiddenOptionsProvider>
  )
}
