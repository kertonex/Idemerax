import AuthLayout from '../components/layout/AuthLayout';
import RegisterForm from '../features/authentication/components/RegisterForm';

function RegisterPage() {
  return (
    <AuthLayout>
      <RegisterForm />
    </AuthLayout>
  );
}

export default RegisterPage;
