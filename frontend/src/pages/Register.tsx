import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { TftecCopaLogo } from '@/components/copa/TftecCopaLogo';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/lib/api';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await register({ name, email, password });
      toast.success('Conta criada! Bem-vindo ao bolão.');
      navigate('/palpites', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center py-12">
      <Card className="w-full max-w-md border-border/60 bg-card/80 backdrop-blur">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-2">
            <TftecCopaLogo size="lg" />
          </div>
          <CardTitle className="font-display text-2xl">Criar conta</CardTitle>
          <CardDescription>Cadastre-se grátis e dispute o bolão</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres</p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 items-stretch">
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-tftec-gradient text-primary-foreground hover:opacity-90 border-0"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar conta
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Já tem conta?{' '}
              <Link to="/login" className="underline underline-offset-4 hover:text-foreground">
                Entrar
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
