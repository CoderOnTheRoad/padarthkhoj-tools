export class DeveloperProfilePage {
  constructor(container) {
    this.container = container;
  }

  render() {
    document.documentElement.classList.add('developer-page-open');
    this.container.innerHTML = `
      <div class="developer-profile">
       <div class="profile-comparison">
        <section class="developer-primary-column" aria-label="Sourav Ghosh profile">
        <section class="developer-hero" aria-labelledby="developer-name">
          <figure class="developer-portrait">
            <img src="./developer/sourav-ghosh-animated.gif" alt="Animated portrait of Sourav Ghosh">
          </figure>
          <div class="developer-intro">
            <div class="developer-kicker">Developer · Computational materials tools</div>
            <h1 id="developer-name">Sourav Ghosh</h1>
            <p class="developer-role">Computational Materials Researcher · Machine Learning &amp; Python Specialist</p>
            <p class="developer-lead">Creator of Padarthkhoj Tools, with expertise in machine learning, Python and AI-driven materials discovery.</p>
            <div class="developer-tags" aria-label="Current project associations">
              <span>Padarthkhoj Tools</span><span>Machine Learning</span><span>Python</span><span>AI-driven materials discovery</span>
            </div>
            <nav class="developer-social-rounds" aria-label="Sourav Ghosh scholarly and developer profiles">
              <a class="scholar-mark" href="https://scholar.google.com/citations?user=LH2xL7kAAAAJ&amp;hl=en" target="_blank" rel="noopener noreferrer" aria-label="Google Scholar profile" data-label="Scholar"><img src="./developer/social-icons/google-scholar.svg" alt=""></a>
              <a class="researchgate-mark" href="https://www.researchgate.net/profile/Sourav-Ghosh-72?ev=hdr_xprf" target="_blank" rel="noopener noreferrer" aria-label="ResearchGate profile" data-label="ResearchGate"><img src="./developer/social-icons/researchgate.svg" alt=""></a>
              <a class="orcid-mark" href="https://orcid.org/0009-0007-4964-6573" target="_blank" rel="noopener noreferrer" aria-label="ORCID 0009-0007-4964-6573" data-label="ORCID"><img src="./developer/social-icons/orcid.svg" alt=""></a>
              <a class="github-mark" href="https://github.com/CoderOnTheRoad" target="_blank" rel="noopener noreferrer" aria-label="GitHub profile CoderOnTheRoad" data-label="GitHub"><img src="./developer/social-icons/github.svg" alt=""></a>
            </nav>
          </div>
          <div class="developer-mark" aria-label="Developer profile"><span>◆</span><strong>DEV</strong><small>Profile</small></div>
        </section>

        <section class="developer-grid">
          <article class="developer-card developer-about">
            <span class="developer-card-index">01</span>
            <h2>About me</h2>
            <div class="developer-about-copy">
              <p>I am a computational materials researcher, machine-learning practitioner and scientific-software developer working where atomistic simulation, artificial intelligence and materials discovery meet. I have expertise in Machine Learning, Python and AI-driven materials discovery, and I use these capabilities to transform complex scientific data into interpretable models, reproducible workflows and practical research tools.</p>
              <p>My research interests span density-functional-theory workflows, catalytic reaction intermediates, charge transfer, projected electronic structure, vibrational thermochemistry and free-energy analysis. A central theme of my work is combining physics-based understanding with machine learning—using Python to prepare reliable datasets, engineer meaningful materials descriptors and develop AI-assisted approaches for identifying promising materials and catalytic behaviour.</p>
              <p>I created <strong>Padarthkhoj Tools</strong> to bring that philosophy into practice—a browser-native workspace that connects crystal structures, Quantum ESPRESSO inputs, reaction-pathway design, Bader and PDOS analysis, orbital descriptors, vibrational corrections and scientific visualization without hiding the scientific decisions behind the interface.</p>
            </div>
          </article>
          <article class="developer-card">
            <span class="developer-card-index">02</span>
            <h2>Academic information</h2>
            <div class="academic-timeline">
              <div class="academic-entry">
                <time>2022—Present</time>
                <div><h3>PhD in Physics</h3><p class="academic-institute">SRM University–AP</p><p>Research in computational materials science under the guidance of Prof. Ranjit Thapa.</p><span>Ongoing</span></div>
              </div>
              <div class="academic-entry">
                <time>2015—2020</time>
                <div><h3>BS–MS · Major in Physics</h3><p class="academic-institute">Indian Institute of Science Education and Research Bhopal <small>IISER Bhopal</small></p></div>
              </div>
              <div class="academic-entry">
                <time>2013—2015</time>
                <div><h3>Higher Secondary</h3><p class="academic-institute">Bankura Zilla School</p></div>
              </div>
            </div>
          </article>
          <article class="developer-card">
            <span class="developer-card-index">03</span>
            <h2>Research profile</h2>
            <p>My current work combines physics-based modelling with practical tools for reproducible and data-ready computational research.</p>
            <div class="developer-skill-cloud" aria-label="Research and technical interests">
              <span>Machine Learning</span><span>Python</span><span>Artificial Intelligence</span><span>AI-driven materials discovery</span><span>Materials informatics</span><span>Scientific data pipelines</span><span>Density functional theory</span><span>Quantum ESPRESSO</span><span>Computational electrocatalysis</span><span>Electronic structure</span>
            </div>
          </article>
        </section>

        <aside class="developer-note">
          <span>Profile under construction</span>
          <p>Additional sections remain intentionally unpublished until their information is provided.</p>
        </aside>
        </section>

        <div class="developer-mentors">
        <section class="mentor-profile" aria-labelledby="mentor-name">
          <header class="mentor-header">
            <figure class="mentor-photo">
              <img src="./developer/ranjit-thapa.jpg" alt="Official faculty portrait of Prof. Ranjit Thapa">
            </figure>
            <div>
              <div class="developer-kicker">Research mentor</div>
              <h2 id="mentor-name">Prof. Ranjit Thapa</h2>
              <p>Professor of Physics · Dean–Research · SRM University–AP</p>
            </div>
            <a class="mentor-official-link" href="https://www.srmap.edu.in/faculty/prof-ranjit-thapa/" target="_blank" rel="noopener noreferrer">Official faculty profile <span>↗</span></a>
          </header>

          <div class="mentor-content">
            <article class="mentor-summary">
              <h3>Profile</h3>
              <p>Prof. Ranjit Thapa is a computational materials physicist whose research connects first-principles quantum mechanics, machine learning and catalyst descriptor theory. His work addresses low-dimensional and carbon-based materials, Pt-free and single-atom catalysts, electrochemical energy-conversion reactions, and electrode materials for lithium- and sodium-ion batteries.</p>
              <p>His current programme includes AI-powered scientific pipelines, quantum-mechanics/machine-learning approaches, microkinetic modelling and descriptor-led discovery for ORR, OER, HER, NRR and carbon-oxide reduction. He has held research and academic positions in India and South Korea and has led the Department of Physics and research administration at SRM University–AP.</p>
              <div class="mentor-interests" aria-label="Prof. Ranjit Thapa research interests">
                <span>Quantum mechanics + ML</span><span>Catalyst descriptors</span><span>Microkinetic modelling</span><span>Electrocatalysis</span><span>Low-dimensional materials</span><span>Battery materials</span><span>AI research pipelines</span>
              </div>
            </article>

            <div class="mentor-facts">
              <article>
                <h3>Education</h3>
                <dl><div><dt>2011</dt><dd>PhD · Jadavpur University</dd></div><div><dt>2004</dt><dd>Master’s · University of North Bengal</dd></div><div><dt>2002</dt><dd>Bachelor’s · University of North Bengal</dd></div></dl>
              </article>
              <article>
                <h3>Selected recognition</h3>
                <ul><li>Outstanding Teacher Award, SRM University–AP · 2023</li><li>Best Researcher Award, SRM University–AP · 2020</li><li>Young Scientist Research Award, Department of Atomic Energy · 2018</li><li>Associate, Indian Academy of Sciences · 2016</li></ul>
              </article>
              <article>
                <h3>Academic journey</h3>
                <p>Professor at SRM University–AP since 2019 and Dean–Research since 2023; formerly Head of Physics and Associate Dean–Sciences. Earlier appointments include SRM Research Institute, a postdoctoral fellowship at UNIST, South Korea, and a research associateship at the Indian Association for the Cultivation of Science.</p>
              </article>
              <article class="mentor-links">
                <h3>Connect and verify</h3>
                <a href="mailto:ranjit.t@srmap.edu.in">ranjit.t@srmap.edu.in</a>
                <a href="https://www.sciencedirect.com/author/57206173374/ranjit-thapa" target="_blank" rel="noopener noreferrer">ScienceDirect author profile ↗</a>
                <a href="https://mym2017.ias.ac.in/Speakers/Ranjit_Thapa" target="_blank" rel="noopener noreferrer">Indian Academy of Sciences profile ↗</a>
              </article>
            </div>
          </div>
          <footer class="mentor-source-note">Profile information summarized from SRM University–AP and the Indian Academy of Sciences. Full publication, project, patent and scholar lists are available through the official faculty profile.</footer>
        </section>

        <section class="mentor-profile" aria-labelledby="om-jadhav-name">
          <header class="mentor-header">
            <figure class="mentor-photo mentor-photo-om">
              <img src="./developer/om-jadhav.png" alt="Portrait of Om Jadhav">
            </figure>
            <div>
              <div class="developer-kicker">Research mentor</div>
              <h2 id="om-jadhav-name">Om Jadhav</h2>
              <p>Scientist D · Centre for Development of Advanced Computing (C-DAC), Pune</p>
            </div>
            <a class="mentor-official-link" href="https://www.cdac.gov.in/index.aspx?id=C-DAC_Employee_List" target="_blank" rel="noopener noreferrer">Official C-DAC directory <span>↗</span></a>
          </header>
          <div class="mentor-content">
            <article class="mentor-summary">
              <h3>Profile</h3>
              <p>Om Gangadhar Jadhav is a Scientist D at C-DAC, Pune. His work includes high-performance computing and parallel programming, with contributions to scientific application development and practical HPC training.</p>
              <p>He led hands-on OpenMP programming sessions at C-DAC’s 2025 faculty development programme on Quantum and High-Performance Computing. C-DAC’s publication list also credits him as a co-author of a HiPC 2023 contribution on migrating a CUDA-based seismic application to a cross-platform SYCL implementation.</p>
              <div class="mentor-interests" aria-label="Om Jadhav areas of work">
                <span>High-performance computing</span><span>Parallel programming</span><span>OpenMP</span><span>CUDA</span><span>SYCL</span><span>Scientific computing</span>
              </div>
            </article>
            <div class="mentor-facts">
              <article>
                <h3>Affiliation</h3>
                <p>Centre for Development of Advanced Computing, Pune, India.</p>
              </article>
              <article class="mentor-links">
                <h3>Connect and verify</h3>
                <a href="https://in.linkedin.com/in/om-jadhav-62408668" target="_blank" rel="noopener noreferrer">LinkedIn profile ↗</a>
                <a href="https://www.cdac.gov.in/index.aspx?id=lu_QHPC-FDP" target="_blank" rel="noopener noreferrer">C-DAC Quantum and HPC programme ↗</a>
                <a href="https://www.cdac.gov.in/index.aspx?id=hpc_a_resent_pub" target="_blank" rel="noopener noreferrer">C-DAC HPC publications ↗</a>
              </article>
            </div>
          </div>
          <footer class="mentor-source-note">Profile information summarized from C-DAC’s employee directory, Quantum and HPC programme report, and HPC publication list.</footer>
        </section>
        </div>
       </div>
      </div>`;
  }

  destroy() {
    document.documentElement.classList.remove('developer-page-open');
  }
}
