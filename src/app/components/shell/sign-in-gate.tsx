import { Wallet } from 'lucide-react';
import { useSignIn } from './use-sign-in';

interface SignInGateProps {
  title: string;
  message: string;
}

/** The one sign-in prompt used wherever content needs a wallet. */
export function SignInGate({ title, message }: SignInGateProps) {
  const { signIn } = useSignIn();

  return (
    <div className="flex items-center justify-center min-h-[55vh]">
      <div className="w-full max-w-md rounded-2xl bg-ice-surface border border-ice-line/15 p-8 md:p-10 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-ice-accent/[0.08] border border-ice-line/15 flex items-center justify-center">
          <Wallet className="w-8 h-8 text-ice-accent" />
        </div>
        <h2 className="text-ice-text text-[22px] font-bold mb-2">{title}</h2>
        <p className="text-ice-muted mb-8 leading-relaxed text-[15px]">{message}</p>
        <button
          type="button"
          onClick={() => signIn()}
          className="px-6 min-h-[48px] rounded-xl font-semibold transition-transform hover:-translate-y-px text-[16px]"
          style={{ background: 'linear-gradient(180deg, #8be4ff 0%, #4db8ff 100%)', color: '#06223a', boxShadow: '0 2px 16px rgba(139,228,255,0.3)' }}
        >
          Sign In
        </button>
        <p className="text-ice-faint text-[13px] mt-6">Email, Google, or your wallet</p>
      </div>
    </div>
  );
}
