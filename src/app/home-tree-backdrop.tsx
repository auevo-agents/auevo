import Image from "next/image";

export function HomeTreeBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <Image
        src="/images/hero-tree-backdrop.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,12,8,.92)_0%,rgba(4,12,8,.72)_25%,rgba(4,12,8,.22)_52%,rgba(4,12,8,.06)_100%)]"/>
      <div className="absolute inset-x-0 bottom-0 h-[36%] bg-gradient-to-t from-[#06100c] via-[#06100c]/55 to-transparent"/>
      <div className="absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-[#06100c]/70 to-transparent"/>
    </div>
  );
}
