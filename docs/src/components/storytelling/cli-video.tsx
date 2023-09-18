export default function CliVideo() {
  return (
    <section className="relative bg-white">
      <div className="mx-auto grid max-w-5xl grid-cols-8 gap-6 gap-y-10 px-6 py-12 md:grid-cols-12">
        <div className="col-span-8 text-center sm:col-span-4 sm:col-start-3 md:col-start-1 md:col-end-6 md:mt-8 md:pr-6 md:text-left">
          <h2 className="text-2xl font-medium">
            Two-way editing, effortlessly with the Keystatic CLI
          </h2>
          <p className="mt-4 text-base">
            Create a new Next.js or Astro project in seconds with the Keystatic
            CLI
          </p>
        </div>
        <div className="col-span-8 sm:col-span-6 sm:col-start-2 md:col-span-7 md:col-start-6">
          <iframe
            className="aspect-video w-full max-w-full rounded-lg shadow"
            src="https://www.youtube.com/embed/E65Fx9all04?controls=0"
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  );
}
