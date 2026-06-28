import React from 'react'

// Legal notice (Impressum) — required under German law (§ 5 TMG).
export default function Imprint({ onHome }) {
  return (
    <article className="imprint reveal">
      <button className="imprint-back" onClick={onHome}>
        ← Back
      </button>
      <h2>Imprint</h2>

      <h3>Legal Notice pursuant to § 5 TMG</h3>
      <p>
        Dominik Foerderreuther
        <br />
        Muellerkoppel 12a
        <br />
        21521 Aumuehle
        <br />
        Deutschland
      </p>

      <h3>Contact</h3>
      <p>
        E-Mail:{' '}
        <a href="mailto:dairies.raptors-1c@icloud.com">dairies.raptors-1c@icloud.com</a>
      </p>

      <h3>Liability for Content</h3>
      <p>
        As a service provider, we are responsible for our own content on these pages in accordance
        with general laws pursuant to § 7 para. 1 TMG. According to §§ 8 to 10 TMG, however, we as a
        service provider are not obligated to monitor transmitted or stored third-party information or
        to investigate circumstances that indicate illegal activity.
      </p>

      <h3>Beta &amp; Disclaimer</h3>
      <p>
        This is a hobby project and me trying to be helpful. I cannot guarantee constant
        availability, stability, or data security. If you don&rsquo;t like this, don&rsquo;t use it.
      </p>

      <h3>Map Data</h3>
      <p>
        This website uses map material from MapTiler as well as geodata from OpenStreetMap (ODbL
        license). When loading the map tiles, your IP address is transmitted to MapTiler&rsquo;s
        servers.
      </p>
    </article>
  )
}
