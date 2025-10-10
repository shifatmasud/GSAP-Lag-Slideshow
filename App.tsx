import React, { useState, useRef, useLayoutEffect } from 'react';

// TypeScript declarations for CDN libraries.
declare const gsap: any;
declare const lil: any;

interface CarouselImage {
  id: number;
  url: string;
  title: string;
  author: string;
}

const images: CarouselImage[] = [
  { id: 0, url: 'https://picsum.photos/id/10/800/800', title: 'Mountain Lake', author: 'Alejandro Escamilla' },
  { id: 1, url: 'https://picsum.photos/id/20/800/800', title: 'Foggy Pier', author: 'Paul Jarvis' },
  { id: 2, url: 'https://picsum.photos/id/30/800/800', title: 'City at Night', author: 'Paul Jarvis' },
  { id: 3, url: 'https://picsum.photos/id/42/800/800', title: 'Workspace', author: 'Tina Rataj' },
  { id: 4, url: 'https://picsum.photos/id/54/800/800', title: 'Vintage Camera', author: 'Luke Chesser' },
  { id: 5, url: 'https://picsum.photos/id/68/800/800', title: 'Autumn Road', author: 'Marcin Czerwinski' },
  { id: 6, url: 'https://picsum.photos/id/75/800/800', title: 'Reading Time', author: 'Verne Ho' },
];

interface AnimationConfig {
  mainEase: string;
  mainOvershoot: number;
  recoil: number;
  cardOvershoot: number;
  stagger: number;
}

const defaultConfig: AnimationConfig = {
  mainEase: 'back.inOut',
  mainOvershoot: 1.7,
  recoil: 80,
  cardOvershoot: 2.5,
  stagger: 0.05,
};

const presets: Record<string, AnimationConfig> = {
  'Default': { ...defaultConfig },
  'Bouncy': { mainEase: 'elastic.out', mainOvershoot: 1.2, recoil: 120, cardOvershoot: 3, stagger: 0.03 },
  'Smooth': { mainEase: 'power4.inOut', mainOvershoot: 1.7, recoil: 40, cardOvershoot: 1.5, stagger: 0.08 },
  'Mechanical': { mainEase: 'power1.inOut', mainOvershoot: 1.7, recoil: 0, cardOvershoot: 1, stagger: 0.1 },
};

/**
 * Decoupled Animation Controller (Renderer Pattern)
 * This class handles all GSAP-related logic, completely separate from React's state and render cycle.
 * It is now stateless regarding the active index and calculates positioning dynamically.
 */
class CarouselAnimation {
  private carouselEl: HTMLDivElement;
  private cards: HTMLElement[];
  private config: AnimationConfig;

  constructor(carouselEl: HTMLDivElement, initialConfig: AnimationConfig) {
    this.carouselEl = carouselEl;
    this.cards = gsap.utils.toArray(this.carouselEl.children);
    this.config = initialConfig;
  }

  public init(startIndex: number) {
    this.snapTo(startIndex);
  }

  public destroy() {
    gsap.killTweensOf([this.carouselEl, ...this.cards]);
  }

  public updateConfig(newConfig: Partial<AnimationConfig>) {
    this.config = { ...this.config, ...newConfig };
  }
  
  private getTargetX(index: number): number {
    if (index < 0 || index >= this.cards.length || !this.carouselEl.parentElement) {
        return 0;
    }
    const parentWidth = this.carouselEl.parentElement.offsetWidth;
    const card = this.cards[index];
    const cardOffsetLeft = card.offsetLeft;
    const cardWidth = card.offsetWidth;

    // Calculate the exact transform needed to center the card.
    // The target is the parent's center minus the card's center relative to the carousel's start.
    return (parentWidth / 2) - cardOffsetLeft - (cardWidth / 2);
  }

  public goTo(fromIndex: number, toIndex: number, onStart?: () => void, onComplete?: () => void) {
    if (toIndex < 0 || toIndex >= this.cards.length) return;

    const targetX = this.getTargetX(toIndex);
    const direction = toIndex > fromIndex ? 1 : (toIndex < fromIndex ? -1 : 0);

    gsap.killTweensOf([this.carouselEl, ...this.cards]);

    const tl = gsap.timeline({ onStart, onComplete });

    const mainEaseConfig = this.config.mainEase;
    const mainTweenVars: any = {
      x: targetX,
      duration: 1.2,
      ease: mainEaseConfig,
    };

    if (mainEaseConfig.includes('back')) {
      mainTweenVars.overshoot = this.config.mainOvershoot;
    } else if (mainEaseConfig.includes('elastic')) {
      mainTweenVars.amplitude = this.config.mainOvershoot;
    }
    
    tl.to(this.carouselEl, mainTweenVars, 0);

    if (direction !== 0) { // Only run recoil animation if slide is changing
        this.cards.forEach((card, i) => {
          const recoilAmount = this.config.recoil * direction;
          const delay = Math.abs(i - fromIndex) * this.config.stagger;
          
          const cardTl = gsap.timeline();
          
          cardTl.to(card, {
            x: -recoilAmount,
            duration: 0.4,
            ease: 'power2.out'
          });

          cardTl.to(card, {
            x: 0,
            duration: 1,
            ease: 'back.out',
            overshoot: this.config.cardOvershoot,
          }, '>');

          tl.add(cardTl, delay);
        });
    }
  }

  public snapTo(index: number) {
    if (!this.cards.length || index < 0 || index >= this.cards.length) return;
    const targetX = this.getTargetX(index);
    gsap.set(this.carouselEl, { x: targetX });
    this.cards.forEach((card) => {
      gsap.set(card, { x: 0 });
    });
  }
}

const debounce = (func: (...args: any[]) => void, delay: number) => {
  let timeoutId: number;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => func(...args), delay);
  };
};

const App: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(Math.floor(images.length / 2));
  const [isAnimating, setIsAnimating] = useState(false);
  const animationController = useRef<CarouselAnimation | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Refs for swipe interaction
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const carouselStartPosRef = useRef(0);
  const velocityTracker = useRef({ lastX: 0, lastTime: 0, velocity: 0 });

  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDraggingRef.current || !carouselRef.current) return;
    e.preventDefault();

    const currentX = e.pageX;
    const deltaX = currentX - startXRef.current;
    
    const now = Date.now();
    const dt = now - velocityTracker.current.lastTime;
    if (dt > 0) {
      const dx = currentX - velocityTracker.current.lastX;
      velocityTracker.current.velocity = dx / dt;
    }
    velocityTracker.current.lastX = currentX;
    velocityTracker.current.lastTime = now;

    gsap.set(carouselRef.current, { x: carouselStartPosRef.current + deltaX });
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);

    const cardWidth = carouselRef.current?.children[0]?.clientWidth ?? 0;
    const currentX = gsap.getProperty(carouselRef.current, "x");
    const deltaX = currentX - carouselStartPosRef.current;
    
    const velocity = velocityTracker.current.velocity;
    const velocityThreshold = 0.3;

    let newIndex = activeIndexRef.current;

    if (Math.abs(velocity) > velocityThreshold) {
      newIndex = velocity < 0 ? newIndex + 1 : newIndex - 1;
    } else {
      if (Math.abs(deltaX) > cardWidth / 2) {
        newIndex = deltaX < 0 ? newIndex + 1 : newIndex - 1;
      }
    }

    newIndex = Math.max(0, Math.min(images.length - 1, newIndex));
    navigateTo(newIndex);
  };

  useLayoutEffect(() => {
    if (!carouselRef.current) return;

    const controller = new CarouselAnimation(carouselRef.current, defaultConfig);
    animationController.current = controller;
    controller.init(activeIndex);
    
    const gui = new lil.GUI();
    const guiState = { ...defaultConfig, preset: 'Default' };
    
    const overshootController = gui.add(guiState, 'mainOvershoot', 0.1, 5, 0.1).name('Main Overshoot');
    const mainEaseController = gui.add(guiState, 'mainEase', ['back.inOut', 'power4.inOut', 'elastic.out', 'bounce.out']).name('Main Ease');
    const recoilController = gui.add(guiState, 'recoil', 0, 200, 1).name('Card Recoil');
    const cardOvershootController = gui.add(guiState, 'cardOvershoot', 0.1, 5, 0.1).name('Card Overshoot');
    const staggerController = gui.add(guiState, 'stagger', 0, 0.2, 0.01).name('Stagger');

    const updateOvershootControl = (ease: string) => {
      const isEnabled = ease.includes('back') || ease.includes('elastic');
      overshootController.disable(!isEnabled);
    };

    const applyConfigToGui = (config: AnimationConfig) => {
      Object.assign(guiState, config);
      mainEaseController.setValue(guiState.mainEase);
      overshootController.setValue(guiState.mainOvershoot);
      recoilController.setValue(guiState.recoil);
      cardOvershootController.setValue(guiState.cardOvershoot);
      staggerController.setValue(guiState.stagger);
      updateOvershootControl(config.mainEase);
    };

    const presetController = gui.add(guiState, 'preset', Object.keys(presets)).name('Preset')
      .onChange((presetName: string) => {
        const newConfig = presets[presetName];
        controller.updateConfig(newConfig);
        applyConfigToGui(newConfig);
      });

    const individualOnChange = (key: keyof AnimationConfig, value: any) => {
        controller.updateConfig({ [key]: value });
        presetController.setValue('Default');
    };

    overshootController.onChange((value: number) => individualOnChange('mainOvershoot', value));
    mainEaseController.onChange((value: string) => {
        individualOnChange('mainEase', value);
        updateOvershootControl(value);
    });
    recoilController.onChange((value: number) => individualOnChange('recoil', value));
    cardOvershootController.onChange((value: number) => individualOnChange('cardOvershoot', value));
    staggerController.onChange((value: number) => individualOnChange('stagger', value));

    gui.add({ reset: () => {
        controller.updateConfig(defaultConfig);
        applyConfigToGui(defaultConfig);
        presetController.setValue('Default');
    } }, 'reset').name('Reset Controls');

    const handleResize = debounce(() => {
        animationController.current?.snapTo(activeIndexRef.current);
    }, 200);

    window.addEventListener('resize', handleResize);

    updateOvershootControl(defaultConfig.mainEase);

    return () => {
      controller.destroy();
      gui.destroy();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const navigateTo = (newIndex: number) => {
    if (isAnimating || newIndex < 0 || newIndex >= images.length) return;
    animationController.current?.goTo(
      activeIndexRef.current,
      newIndex,
      () => setIsAnimating(true),
      () => {
        setActiveIndex(newIndex);
        setIsAnimating(false);
      }
    );
  };
  
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isAnimating) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX;
    carouselStartPosRef.current = gsap.getProperty(carouselRef.current, "x");
    velocityTracker.current = { lastX: e.pageX, lastTime: Date.now(), velocity: 0 };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden antialiased text-white font-sans select-none">
      <div 
        className="w-full h-full absolute inset-0 bg-cover bg-center blur-xl scale-110" 
        style={{ backgroundImage: `url(${images[activeIndex].url})`, transition: 'background-image 0.7s ease-in-out' }}
      />
      <div className="absolute inset-0 bg-black/70" />
      
      <div className="relative w-full flex flex-col items-center justify-center z-10 space-y-8 py-8">
        <div className="text-center transition-opacity duration-500 ease-in-out">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{images[activeIndex].title}</h1>
          <p className="text-lg md:text-xl text-gray-300 mt-2">by {images[activeIndex].author}</p>
        </div>

        <div 
            className="w-full relative h-[400px] md:h-[500px] lg:h-[600px] cursor-grab active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            style={{ touchAction: 'pan-y' }}
        >
            <div
                ref={carouselRef}
                className="absolute top-0 left-0 h-full flex items-center"
            >
                {images.map((image) => (
                    <div
                        key={image.id}
                        className="carousel-card flex-shrink-0 w-[70vw] md:w-[50vw] lg:w-[35vw] h-[80%] mx-8 relative pointer-events-none"
                    >
                        <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl">
                            <img
                                src={image.url}
                                alt={image.title}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>

        <div className="flex flex-col items-center space-y-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigateTo(activeIndex - 1)}
              disabled={isAnimating || activeIndex === 0}
              className="group p-3 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              aria-label="Previous slide"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300 ease-in-out group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={() => navigateTo(activeIndex + 1)}
              disabled={isAnimating || activeIndex === images.length - 1}
              className="group p-3 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              aria-label="Next slide"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300 ease-in-out group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="flex space-x-2">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={() => navigateTo(index)}
                disabled={isAnimating}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  activeIndex === index ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/60'
                } disabled:cursor-not-allowed`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
