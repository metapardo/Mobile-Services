import { ArrowRight, Check, Layers3, MousePointer2, Sparkles } from 'lucide-react';
import { tokens } from '../generated/tokens';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Guidelines } from './parts';

const TYPE_SCALE = [
  { label: 'Display', meta: '48 / 52 · 700', className: 'text-5xl font-bold tracking-[-0.045em]' },
  { label: 'Heading', meta: '30 / 36 · 650', className: 'text-3xl font-semibold tracking-[-0.03em]' },
  { label: 'Title', meta: '20 / 28 · 600', className: 'text-xl font-semibold tracking-[-0.015em]' },
  { label: 'Body', meta: '16 / 24 · 400', className: 'text-base' },
  { label: 'Label', meta: '14 / 20 · 600', className: 'text-sm font-semibold' },
  { label: 'Caption', meta: '12 / 16 · 500', className: 'text-xs font-medium text-muted-foreground' },
] as const;

const SPACING_SCALE = [
  { label: '4', width: 16 },
  { label: '8', width: 32 },
  { label: '12', width: 48 },
  { label: '16', width: 64 },
  { label: '24', width: 96 },
  { label: '32', width: 128 },
] as const;

const CORE_KEYS = ['primary', 'secondary', 'accent'] as const;
const SUPPORTING_KEYS = [
  'background',
  'card',
  'popover',
  'muted',
  'border',
  'foreground',
] as const;

function colorName(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase());
}

function TokenSwatch({
  name,
  value,
}: {
  name: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div
        className="h-20 rounded-xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]"
        style={{ backgroundColor: value }}
      />
      <p className="mt-2 text-sm font-semibold">{name}</p>
      <p className="font-mono text-xs text-muted-foreground">{value}</p>
    </div>
  );
}

export function OverviewPage() {
  return (
    <div className="space-y-6">
      <section className="glass-panel-strong glass-grid relative overflow-hidden rounded-[1.5rem] border p-7 sm:p-10">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <p className="eyebrow">Dark-first product language</p>
            <h2 className="mt-5 max-w-xl text-4xl font-bold tracking-[-0.045em] sm:text-5xl">
              Make focus feel electric.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              Blue Glass combines Flora-like restraint with deep ocean color and
              liquid layers. One bright blue action leads each view; everything
              else recedes into quiet, dimensional navy.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button>
                Start creating <ArrowRight />
              </Button>
              <Button variant="secondary">Explore components</Button>
            </div>
          </div>

          <div className="glass-panel glass-interactive blue-glow relative rounded-[1.35rem] border p-5">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Creative workspace</p>
                <p className="mt-1 text-xs text-muted-foreground">Plan overview</p>
              </div>
              <Badge>Recommended</Badge>
            </div>
            <p className="text-4xl font-semibold tracking-[-0.04em]">
              $28<span className="text-sm font-normal text-muted-foreground"> / month</span>
            </p>
            <div className="my-5 h-px bg-border" />
            <ul className="space-y-3 text-sm text-muted-foreground">
              {['Unlimited projects', 'Shared team assets', 'Priority rendering'].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="glass-shape grid size-5 place-items-center rounded-full text-primary">
                    <Check className="size-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Button className="mt-7 w-full">Choose plan</Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: MousePointer2,
            title: 'One clear action',
            text: 'Reserve electric blue for the action that moves the user forward.',
          },
          {
            icon: Layers3,
            title: 'Depth through layers',
            text: 'Use navy surfaces, hairline borders, and blur before adding shadow.',
          },
          {
            icon: Sparkles,
            title: 'Quiet confidence',
            text: 'Keep typography direct and spacing calm so the interface feels capable.',
          },
        ].map(({ icon: Icon, title, text }) => (
          <Card key={title}>
            <CardContent className="p-5">
              <div className="glass-shape glass-interactive grid size-10 place-items-center rounded-xl text-primary">
                <Icon className="size-5" />
              </div>
              <h3 className="mt-5 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="glass-panel rounded-[1.25rem] border p-6">
        <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="eyebrow">Composed example</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">A useful surface, not a showroom.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Inputs, switches, badges, and actions share the same visual rhythm
              so application screens can stay dense without feeling heavy.
            </p>
          </div>
          <Card className="glass-panel-strong">
            <CardHeader>
              <CardTitle>Create workspace</CardTitle>
              <CardDescription>Invite your team into a focused creative space.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="overview-name">Workspace name</Label>
                <Input id="overview-name" placeholder="North star concepts" />
              </div>
              <div className="glass-shape glass-interactive flex items-center gap-3 rounded-xl p-3">
                <Switch defaultChecked id="overview-notify" />
                <Label htmlFor="overview-notify">Share progress updates</Label>
                <Badge variant="secondary" className="ml-auto">On</Badge>
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <Button variant="ghost">Cancel</Button>
              <Button>Create workspace</Button>
            </CardFooter>
          </Card>
        </div>
      </section>
    </div>
  );
}

export function ColorsPage() {
  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-[1.25rem] border p-6">
        <p className="eyebrow">Core roles</p>
        <div className="mt-3 max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">Blue owns the hierarchy.</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Primary is the high-energy action color. Secondary and accent carry
            selection, hover, support, and depth without competing for attention.
          </p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {CORE_KEYS.map((key) => (
            <TokenSwatch key={key} name={colorName(key)} value={tokens.color.dark[key]} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {(['dark', 'light'] as const).map((mode) => (
          <section key={mode} className="glass-panel rounded-[1.25rem] border p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">{mode} mode</p>
                <h2 className="mt-2 text-xl font-semibold">{mode === 'dark' ? 'Ocean depth' : 'Clear daylight'}</h2>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{mode === 'dark' ? 'Default' : 'Companion'}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {SUPPORTING_KEYS.map((key) => (
                <TokenSwatch key={key} name={colorName(key)} value={tokens.color[mode][key]} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="glass-panel rounded-[1.25rem] border p-6">
        <p className="eyebrow">Usage</p>
        <div className="mt-5 max-w-2xl">
          <Guidelines
            items={[
              { kind: 'do', text: 'Use primary blue once per decision area to make the next step obvious.' },
              { kind: 'do', text: 'Build hierarchy with neighboring navy surfaces before adding more color.' },
              { kind: 'do', text: 'Keep text contrast high on glass; blur is atmosphere, not a substitute for legibility.' },
              { kind: 'dont', text: 'Use primary blue as a large page background or decorate every interactive element with glow.' },
            ]}
          />
        </div>
      </section>
    </div>
  );
}

export function FontsPage() {
  return (
    <div className="space-y-6">
      <section className="glass-panel-strong rounded-[1.25rem] border p-7 sm:p-9">
        <p className="eyebrow">Inter · Geist Mono</p>
        <p className="mt-5 max-w-3xl text-4xl font-bold tracking-[-0.045em] sm:text-5xl">
          Precision without the coldness.
        </p>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
          Inter keeps interface language neutral and compact. Geist Mono marks
          values, tokens, shortcuts, and technical metadata.
        </p>
      </section>

      <section className="glass-panel rounded-[1.25rem] border p-6">
        <div className="space-y-7">
          {TYPE_SCALE.map((entry) => (
            <div key={entry.label} className="grid gap-2 border-b border-border/70 pb-7 last:border-0 last:pb-0 sm:grid-cols-[160px_1fr]">
              <div>
                <p className="text-sm font-semibold">{entry.label}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{entry.meta}</p>
              </div>
              <p className={entry.className}>Build boldly. Keep the path clear.</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function LayoutPage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass-panel rounded-[1.25rem] border p-6">
          <p className="eyebrow">Spacing</p>
          <h2 className="mt-2 text-xl font-semibold">Four-pixel rhythm</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Compact controls sit inside spacious compositions.
          </p>
          <div className="mt-7 space-y-5">
            {SPACING_SCALE.map((space) => (
              <div key={space.label} className="grid grid-cols-[40px_1fr] items-center gap-4">
                <span className="font-mono text-xs text-muted-foreground">{space.label}</span>
                <div className="h-2 rounded-full bg-primary" style={{ width: space.width }} />
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-[1.25rem] border p-6">
          <p className="eyebrow">Radius</p>
          <h2 className="mt-2 text-xl font-semibold">Soft, not bubbly</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Radius increases with surface size. Keep dense controls tighter.
          </p>
          <div className="mt-7 grid grid-cols-2 gap-4">
            {[
              { label: 'Small', className: 'rounded-sm' },
              { label: 'Medium', className: 'rounded-md' },
              { label: 'Large', className: 'rounded-lg' },
              { label: 'Surface', className: 'rounded-xl' },
            ].map((radius) => (
              <div key={radius.label} className={`glass-panel glass-interactive flex h-24 items-end border p-3 ${radius.className}`}>
                <span className="text-xs font-semibold">{radius.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="glass-grid overflow-hidden rounded-[1.25rem] border p-6">
        <p className="eyebrow">Material layers</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="glass-shape rounded-xl p-5">
            <p className="font-semibold">Solid</p>
            <p className="mt-2 text-sm text-muted-foreground">Inputs, tables, and high-density work.</p>
          </div>
          <div className="glass-panel glass-interactive rounded-xl border p-5">
            <p className="font-semibold">Glass</p>
            <p className="mt-2 text-sm text-muted-foreground">Cards and grouped control regions.</p>
          </div>
          <div className="glass-panel-strong glass-interactive rounded-xl border p-5">
            <p className="font-semibold">Strong glass</p>
            <p className="mt-2 text-sm text-muted-foreground">Overlays and important elevated surfaces.</p>
          </div>
        </div>
      </section>
    </div>
  );
}