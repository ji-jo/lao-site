"use client";

import { motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";

export const MusicToggleButton = () => {
  const bars = 5;

  const getRandomHeights = () => {
    return Array.from({ length: bars }, () => Math.random() * 0.8 + 0.2);
  };

  const [heights, setHeights] = useState(() => getRandomHeights());
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  useEffect(() => {
    if (isPlaying) {
      const waveformIntervalId = setInterval(() => {
        setHeights(getRandomHeights());
      }, 100);

      return () => {
        clearInterval(waveformIntervalId);
      };
    }
    setHeights(Array(bars).fill(0.1));
  }, [isPlaying]);

  const handleClick = async () => {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio("/audio/audio.m4a");
      audio.loop = true;
      audio.preload = "none";
      audio.addEventListener("play", () => setIsPlaying(true));
      audio.addEventListener("pause", () => setIsPlaying(false));
      audio.addEventListener("ended", () => setIsPlaying(false));
      audioRef.current = audio;
    }

    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await audio.play();
    } catch {
      setIsPlaying(false);
    }
  };

  return (
    <motion.div
      onClick={handleClick}
      key="audio"
      initial={{ padding: "8px 12px" }}
      whileHover={{ padding: "10px 14px", backgroundColor: "rgba(255, 255, 255, 0.05)" }}
      whileTap={{ padding: "10px 14px", backgroundColor: "rgba(255, 255, 255, 0.1)" }}
      transition={{ duration: 0.5, bounce: 0.6, type: "spring" }}
      className="cursor-pointer rounded-full p-2"
    >
      <motion.div
        initial={{ opacity: 0, filter: "blur(4px)" }}
        animate={{
          opacity: 1,
          filter: "blur(0px)",
        }}
        exit={{ opacity: 0, filter: "blur(4px)" }}
        transition={{ type: "spring", bounce: 0.35 }}
        className="flex h-[18px] w-full items-center gap-1 rounded-full"
      >
        {/* Waveform visualization */}
        {heights.map((height, index) => (
          <motion.div
            key={index}
            className="w-[2px] rounded-full bg-text-hi"
            initial={{ height: 2 }}
            animate={{
              height: Math.max(4, height * 14),
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 10,
            }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
};
