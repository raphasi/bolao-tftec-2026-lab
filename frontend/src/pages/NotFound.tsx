import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
      <div className="text-7xl font-bold text-muted-foreground/30">404</div>
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-muted-foreground max-w-md">
        O endereço que você acessou não existe ou foi movido.
      </p>
      <Link to="/">
        <Button>Voltar ao início</Button>
      </Link>
    </div>
  );
}
