import RegisterForm from '../features/authentication/components/RegisterForm';

/** Render the user registration page. */
function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      <RegisterForm />
    </main>
  );
}

export default RegisterPage;
