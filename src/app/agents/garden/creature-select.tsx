/* eslint-disable @next/next/no-img-element -- Same embedded thumbnails as entity-picker.tsx, used here outside the 3D scene. */
"use client";

import { ENTITY_CHOICES, type EntityKind } from "./entity-catalog";
import beetle from "./entity-thumbnails/beetle.png";
import ant from "./entity-thumbnails/ant.png";
import caterpillar from "./entity-thumbnails/caterpillar.png";
import bird from "./entity-thumbnails/bird.png";
import fox from "./entity-thumbnails/fox.png";

const thumbnails = { beetle, ant, caterpillar, bird, fox };

/** Creature picker for agent-creation forms — same catalog as the Passport garden's EntityPicker, without the 3D "inspect" affordance those forms have no scene for. */
export function CreatureSelect({ kind, onChoose }: { kind: EntityKind; onChoose: (kind: EntityKind) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs text-[#7a8390]">Pick a forest companion</span>
      <div className="grid grid-cols-5 gap-2" role="group" aria-label="Choose entity appearance">
        {ENTITY_CHOICES.map((choice) => {
          const image = thumbnails[choice.id];
          const selected = kind === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChoose(choice.id)}
              className={`flex flex-col items-center gap-1 rounded-[3px] border p-1.5 transition ${
                selected ? "border-[#8cf0bd]/60 bg-[#8cf0bd]/[0.07]" : "border-white/[0.08] hover:border-white/[0.18]"
              }`}
            >
              <img src={typeof image === "string" ? image : image.src} alt="" width={64} height={50} className="h-auto w-full" />
              <span className="text-[10px] text-[#aeb5bf]">{choice.name}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-[#67717e]">
        Cosmetic only — it does not set capabilities or reputation. Change it anytime from the agent&apos;s Passport.
      </p>
    </div>
  );
}
