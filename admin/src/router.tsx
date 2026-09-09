import { OrderList } from './features/orders/OrderList';
import { OrderDetail } from './features/orders/OrderDetail';
import { StockList } from './features/inventory/StockList';
import { ProductList } from './features/catalog/ProductList';
import { ProductEditor } from './features/catalog/ProductEditor';
import { CategoryList } from './features/catalog/CategoryList';
import { ServiceDetail } from './features/service/ServiceDetail';
import { JobDetail } from './features/technicians/JobDetail';
import { Overview } from './features/dashboard/Overview';
import { NotificationFailures } from './features/operations/NotificationFailures';
import { AuditLog } from './features/operations/AuditLog';
import { ServiceQueue } from './features/service/ServiceQueue';
import { AssignedJobs } from './features/technicians/AssignedJobs';
import { ServiceTypes } from './features/config/ServiceTypes';
import { ServiceIntakeSettings } from './features/config/ServiceIntakeSettings';
import { MachineModels } from './features/config/MachineModels';
import { ShopSettings } from './features/config/ShopSettings';
import { TechnicianList } from './features/technicians/TechnicianList';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './app/AppShell';
import { AuthGuard } from './app/AuthGuard';
import { RoleGuard } from './app/RoleGuard';
import { OtpLogin } from './features/auth/OtpLogin';
import { useWebSession } from './features/auth/useWebSession';

function Home() {
  const { session } = useWebSession();
  return <Navigate to={session?.role === 'admin' ? '/overview' : '/jobs'} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<OtpLogin />} />
      <Route element={<AuthGuard />}>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route element={<RoleGuard role="admin" />}>
            <Route path="/configuration" element={<MachineModels />} />
            <Route path="/configuration/shop" element={<ShopSettings />} />
            <Route path="/people" element={<TechnicianList />} />
            <Route path="/configuration/service-types" element={<ServiceTypes />} />
            <Route path="/configuration/intake" element={<ServiceIntakeSettings />} />
            <Route path="/service" element={<ServiceQueue />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/operations" element={<NotificationFailures />} />
            <Route path="/operations/audit" element={<AuditLog />} />
            <Route path="/service/:requestId" element={<ServiceDetail />} />
            <Route path="/catalog/categories" element={<CategoryList />} />
            <Route path="/orders" element={<OrderList />} />
            <Route path="/orders/:orderId" element={<OrderDetail />} />
            <Route path="/catalog/inventory" element={<StockList />} />
            <Route path="/catalog" element={<ProductList />} />
            <Route path="/catalog/products/new" element={<ProductEditor />} />
            <Route path="/catalog/products/:productId" element={<ProductEditor />} />
          </Route>
          <Route element={<RoleGuard role="technician" />}>
            <Route path="/jobs/:requestId" element={<JobDetail />} />
            <Route path="/jobs" element={<AssignedJobs />} />
          </Route>
          <Route path="*" element={<section><h1>Page not found</h1><p>Choose a page from your workspace navigation.</p></section>} />
        </Route>
      </Route>
    </Routes>
  );
}
