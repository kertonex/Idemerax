import LoginForm from '../features/authentication/components/LoginForm';

function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <div className="text-lg font-semibold text-white">Idemerax</div>

        <LoginForm />
      </div>
    </main>
  );
}

export default LoginPage;
