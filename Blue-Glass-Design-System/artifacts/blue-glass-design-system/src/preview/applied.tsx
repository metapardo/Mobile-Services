import { Check, Info } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';

type Plan = {
  name: string;
  description: string;
  price: string;
  note: string;
  features: readonly string[];
  action: string;
  featured?: boolean;
};

const PLANS: readonly Plan[] = [
  {
    name: 'Free',
    description: 'Explore the workspace and learn the system.',
    price: '$0',
    note: 'No card required',
    features: ['1 personal seat', '3 active projects', 'Core creation tools'],
    action: 'Current plan',
  },
  {
    name: 'Starter',
    description: 'A focused creative workspace for daily work.',
    price: '$16',
    note: '$48 billed quarterly',
    features: ['Up to 8 seats', 'Unlimited projects', 'All creative tools'],
    action: 'Choose Starter',
  },
  {
    name: 'Pro',
    description: 'Collaboration and workflow power for growing teams.',
    price: '$40',
    note: '$120 billed quarterly',
    features: ['Everything in Starter', 'Shared team assets', 'Usage analytics'],
    action: 'Choose Pro',
    featured: true,
  },
  {
    name: 'Max',
    description: 'Creative infrastructure for demanding teams.',
    price: '$160',
    note: '$480 billed quarterly',
    features: ['Everything in Pro', 'Custom voices', 'Priority processing'],
    action: 'Choose Max',
  },
] as const;

export function PricingExamplePage() {
  return (
    <section className="glass-grid overflow-hidden rounded-[1.5rem] border bg-background/55 p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="eyebrow">Applied composition</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">Plans & billing</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A dense comparison stays calm when hierarchy comes from spacing, not decoration.
          </p>
          <div className="glass-panel mx-auto mt-6 inline-flex rounded-full border p-1">
            {['Monthly', 'Quarterly', 'Enterprise'].map((period, index) => (
              <button
                key={period}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                  index === 1 ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                type="button"
              >
                {period}
                {index === 1 ? <span className="ml-1 text-primary">20% off</span> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => (
            <article
              key={plan.name}
              className={`glass-panel glass-interactive relative flex min-h-[430px] flex-col rounded-[1.25rem] border p-5 ${
                plan.featured ? 'blue-glow border-primary/55 bg-primary/[0.06]' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-semibold tracking-tight">{plan.name}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-5 text-muted-foreground">{plan.description}</p>
                </div>
                {plan.featured ? <Badge>Most popular</Badge> : null}
              </div>

              <div className="my-5 h-px bg-border/80" />

              <div>
                <p className="text-3xl font-semibold tracking-[-0.035em]">
                  {plan.price}<span className="text-sm font-normal text-muted-foreground"> / mo</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{plan.note}</p>
              </div>

               <div className="glass-shape mt-5 rounded-xl p-3">
                <p className="flex items-center justify-between text-xs font-semibold text-primary">
                  Launch offer <Info className="size-3.5" />
                </p>
              </div>

              <ul className="mt-5 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button className="mt-6 w-full" variant={plan.featured ? 'default' : 'secondary'}>
                {plan.action}
              </Button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}