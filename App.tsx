import React, { useReducer, useRef, useLayoutEffect, useState, useEffect } from 'react';

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
  stagger: number;
}

const defaultConfig: AnimationConfig = {
  stagger: 0.05,
};

class CarouselAnimation {
  private carouselEl: HTMLDivElement;
  public cards: HTMLElement[];
  private config: AnimationConfig;
  public mainTween: any | null = null;
  public cardsTimeline: any | null = null;


  constructor(carouselEl: HTMLDivElement, initialConfig: AnimationConfig) {
    this.carouselEl = carouselEl;
    this.cards = gsap.utils.toArray(this.carouselEl.children);
    this.config = initialConfig;
  }
  
  public getClosestIndex(): number {
    if (!this.carouselEl) return 0;
    const currentX = gsap.getProperty(this.carouselEl, 'x') as number;
    let closestIndex = -1;
    let minDistance = Infinity;

    for (let i = 0; i < this.cards.length; i++) {
        const targetX = this.getTargetX(i);
        const distance = Math.abs(currentX - targetX);
        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = i;
        }
    }
    return closestIndex;
  }

  public destroy() {
    this.mainTween?.kill();
    this.cardsTimeline?.kill();
    gsap.killTweensOf([this.carouselEl, ...this.cards]);
  }

  public updateConfig(newConfig: Partial<AnimationConfig>) {
    this.config = { ...this.config, ...newConfig };
  }
  
  private getTargetX(index: number): number {
    if (index < 0 || index >= this.cards.length || !this.carouselEl.parentElement) return 0;
    const parentWidth = this.carouselEl.parentElement.offsetWidth;
    const card = this.cards[index];
    if (!card) return 0;
    const cardOffsetLeft = card.offsetLeft;
    const cardWidth = card.offsetWidth;
    return (parentWidth / 2) - cardOffsetLeft - (cardWidth / 2);
  }

  public drag(baseX: number, deltaX: number) {
    if (!this.carouselEl) return;
    gsap.set(this.carouselEl, { x: baseX + deltaX });
  }

  public goTo(fromIndex: number, toIndex: number, onComplete?: () => void) {
    if (toIndex < 0 || toIndex >= this.cards.length) return;

    this.mainTween = gsap.to(this.carouselEl, {
      x: this.getTargetX(toIndex),
      duration: 1.5,
      ease: 'power4.inOut',
      overwrite: 'auto',
      onComplete: onComplete,
    });

    this.cardsTimeline?.kill();
    
    const cardTransformers = this.cards
      .map(card => card.querySelector('.card-transformer') as HTMLElement)
      .filter(Boolean);

    if (fromIndex !== toIndex) {
        const pushAmount = 40; // The distance cards are pushed away.

        this.cardsTimeline = gsap.to(cardTransformers, {
            keyframes: [
                {
                    // "Push away" from the target card
                    x: (i) => {
                        if (i < toIndex) return -pushAmount;
                        if (i > toIndex) return pushAmount;
                        return 0; // The target card is the source of the "push"
                    },
                    duration: 0.6,
                    ease: 'power3.out'
                },
                {
                    // "Settle" back to rest
                    x: 0,
                    duration: 1.0,
                    ease: 'power4.out'
                }
            ],
            stagger: {
                each: this.config.stagger,
                from: toIndex, // The effect radiates from the destination card
                ease: 'power2.out',
            },
            overwrite: true,
        });
    } else {
        // If snapping back to the same card, just animate back to rest.
        this.cardsTimeline = gsap.to(cardTransformers, {
            x: 0,
            duration: 0.6,
            ease: 'power3.out',
            overwrite: true,
        });
    }
  }

  public snapTo(index: number) {
    if (!this.cards.length || index < 0 || index >= this.cards.length) return;
    gsap.set(this.carouselEl, { x: this.getTargetX(index) });
  }
}

// FSM State and Actions
interface CarouselState {
  currentIndex: number;
  fromIndex: number;
  status: 'idle' | 'animating';
}

type CarouselAction =
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'GOTO'; payload: number }
  | { type: 'ANIMATION_END' }
  | { type: 'INTERRUPT'; payload: number };

const initialCarouselState: CarouselState = {
  currentIndex: 0,
  fromIndex: 0,
  status: 'idle',
};

function carouselReducer(state: CarouselState, action: CarouselAction): CarouselState {
  switch (action.type) {
    case 'NEXT': {
      const nextIndex = (state.currentIndex + 1) % images.length;
      return { ...state, status: 'animating', fromIndex: state.currentIndex, currentIndex: nextIndex };
    }
    case 'PREV': {
      const prevIndex = (state.currentIndex - 1 + images.length) % images.length;
      return { ...state, status: 'animating', fromIndex: state.currentIndex, currentIndex: prevIndex };
    }
    case 'GOTO': {
      if (state.currentIndex === action.payload) return state;
      return { ...state, status: 'animating', fromIndex: state.currentIndex, currentIndex: action.payload };
    }
    case 'INTERRUPT': {
      const newIndex = action.payload;
      return {
        ...state,
        status: 'idle',
        currentIndex: newIndex,
        fromIndex: newIndex,
      };
    }
    case 'ANIMATION_END':
      return {
        ...state,
        status: 'idle',
        fromIndex: state.currentIndex,
      };
    default:
      return state;
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
  const [state, dispatch] = useReducer(carouselReducer, initialCarouselState);
  const [displayedImage, setDisplayedImage] = useState<CarouselImage>(images[initialCarouselState.currentIndex]);
  const [visibleBg, setVisibleBg] = useState(0);
  
  const currentIndexRef = useRef(state.currentIndex);
  currentIndexRef.current = state.currentIndex;

  const animationController = useRef<CarouselAnimation | null>(null);
  const masterTimelineRef = useRef<any>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const gestureWrapperRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const authorRef = useRef<HTMLParagraphElement>(null);
  const bgRef1 = useRef<HTMLDivElement>(null);
  const bgRef2 = useRef<HTMLDivElement>(null);
  const dragInfo = useRef({ isDragging: false, startX: 0, startCarouselX: 0, pointerId: null as number | null });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;

    if (state.status === 'animating') {
        masterTimelineRef.current?.kill();
        animationController.current?.destroy();
        
        const closestIndex = animationController.current!.getClosestIndex();
        dispatch({ type: 'INTERRUPT', payload: closestIndex });
        setDisplayedImage(images[closestIndex]);
    }
    
    dragInfo.current = {
      isDragging: true,
      startX: e.clientX,
      startCarouselX: gsap.getProperty(carouselRef.current, 'x'),
      pointerId: e.pointerId
    };
    
    if (gestureWrapperRef.current) {
      gestureWrapperRef.current.style.cursor = 'grabbing';
      gestureWrapperRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragInfo.current.isDragging || e.pointerId !== dragInfo.current.pointerId) return;
    const deltaX = e.clientX - dragInfo.current.startX;
    animationController.current?.drag(dragInfo.current.startCarouselX, deltaX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragInfo.current.isDragging || e.pointerId !== dragInfo.current.pointerId) return;

    if (gestureWrapperRef.current) {
        gestureWrapperRef.current.style.cursor = 'grab';
        gestureWrapperRef.current.releasePointerCapture(e.pointerId);
    }

    const deltaX = e.clientX - dragInfo.current.startX;
    const cardWidth = carouselRef.current?.querySelector('.carousel-card')?.offsetWidth ?? 300;
    const threshold = cardWidth / 5; // More sensitive swipe

    if (deltaX < -threshold) {
        dispatch({ type: 'NEXT' });
    } else if (deltaX > threshold) {
        dispatch({ type: 'PREV' });
    } else {
        animationController.current?.goTo(state.currentIndex, state.currentIndex);
    }
    
    dragInfo.current.isDragging = false;
  };

  useLayoutEffect(() => {
    if (state.status === 'animating' && animationController.current) {
      masterTimelineRef.current?.kill();
      
      const masterTimeline = gsap.timeline({
        onComplete: () => {
          dispatch({ type: 'ANIMATION_END' });
          setVisibleBg(prev => 1 - prev);
          setDisplayedImage(images[state.currentIndex]);
        }
      });
      masterTimelineRef.current = masterTimeline;

      masterTimeline.to([titleRef.current, authorRef.current], {
        y: '-100%', opacity: 0, duration: 0.5, ease: 'power3.in', stagger: 0.05,
        overwrite: 'auto',
      }, 0);
      
      const bgRefs = [bgRef1, bgRef2];
      const newBgRef = bgRefs[1 - visibleBg].current;
      const oldBgRef = bgRefs[visibleBg].current;
      const newImage = images[state.currentIndex];
  
      if (newBgRef && newImage) {
          newBgRef.style.backgroundImage = `url(${newImage.url})`;
          masterTimeline.to(newBgRef, { opacity: 1, duration: 1.2, ease: 'power2.inOut', overwrite: 'auto' }, 0.1);
      }
      if (oldBgRef) {
          masterTimeline.to(oldBgRef, { opacity: 0, duration: 1.2, ease: 'power2.inOut', overwrite: 'auto' }, 0.1);
      }

      animationController.current.goTo(state.fromIndex, state.currentIndex);
    }
  }, [state.status, state.currentIndex, state.fromIndex, visibleBg]);

  useEffect(() => {
    if (state.status !== 'animating') {
      gsap.fromTo([titleRef.current, authorRef.current], 
        { y: '100%', opacity: 0 }, 
        {
          y: '0%', opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.1,
          overwrite: 'auto',
        }
      );
    }
  }, [displayedImage, state.status]);

  useLayoutEffect(() => {
    if (!carouselRef.current) return;

    const controller = new CarouselAnimation(carouselRef.current, defaultConfig);
    animationController.current = controller;
    controller.snapTo(initialCarouselState.currentIndex);

    if(bgRef1.current) {
        bgRef1.current.style.backgroundImage = `url(${images[initialCarouselState.currentIndex].url})`;
        gsap.set(bgRef1.current, { opacity: 1 });
    }

    const gui = new lil.GUI();
    gui.add({ stagger: defaultConfig.stagger }, 'stagger', 0, 0.2, 0.01).name('Stagger').onChange((v:number) => controller.updateConfig({ stagger: v }));
    
    const handleResize = debounce(() => {
        animationController.current?.snapTo(currentIndexRef.current);
    }, 200);
    window.addEventListener('resize', handleResize);

    return () => {
      controller.destroy();
      gui.destroy();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden antialiased text-white font-sans select-none">
      <div ref={bgRef1} className="w-full h-full absolute inset-0 bg-cover bg-center blur-xl scale-110"/>
      <div ref={bgRef2} className="w-full h-full absolute inset-0 bg-cover bg-center blur-xl scale-110 opacity-0"/>
      <div className="absolute inset-0 bg-black/70" />
      
      <div className="relative w-full flex flex-col items-center justify-center z-10 space-y-8 py-8">
        <div className="text-center">
            <div className="h-12 md:h-14 overflow-hidden">
                <h1 ref={titleRef} className="text-4xl md:text-5xl font-bold tracking-tight">{displayedImage?.title}</h1>
            </div>
            <div className="h-7 md:h-8 overflow-hidden mt-2">
                <p ref={authorRef} className="text-lg md:text-xl text-gray-300">by {displayedImage?.author}</p>
            </div>
        </div>

        <div 
            ref={gestureWrapperRef}
            className="w-full relative h-[400px] md:h-[500px] lg:h-[600px]"
            style={{ touchAction: 'pan-y', cursor: 'grab' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <div ref={carouselRef} className="absolute top-0 left-0 h-full flex items-center">
                {images.map((image, index) => (
                    <div key={`${image.id}-${index}`} className="carousel-card flex-shrink-0 w-[70vw] md:w-[50vw] lg:w-[35vw] h-[80%] mx-8 relative pointer-events-none">
                        <div className="card-transformer w-full h-full">
                            <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl">
                                <img src={image.url} alt={image.title} className="w-full h-full object-cover"/>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        <div className="flex flex-col items-center space-y-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => dispatch({type: 'PREV'})}
              className="group p-3 rounded-full bg-white/10 transition-all enabled:hover:bg-white/20"
              aria-label="Previous slide"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300 ease-in-out group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={() => dispatch({type: 'NEXT'})}
              className="group p-3 rounded-full bg-white/10 transition-all enabled:hover:bg-white/20"
              aria-label="Next slide"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300 ease-in-out group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="flex space-x-2">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={() => dispatch({type: 'GOTO', payload: index })}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${ state.currentIndex === index ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/60' }`}
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
