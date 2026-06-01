import ffmpeg from 'fluent-ffmpeg'
import { getTempPath } from './utils.js'
import { unlink } from 'fs/promises'

export async function convertToAudio(inputPath: string): Promise<string> {
  const output = getTempPath('mp3')
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(128)
      .save(output)
      .on('end', () => resolve(output))
      .on('error', reject)
  })
}

export async function convertToMp4(inputPath: string): Promise<string> {
  const output = getTempPath('mp4')
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-movflags faststart', '-preset fast', '-crf 28'])
      .save(output)
      .on('end', () => resolve(output))
      .on('error', reject)
  })
}

export async function getMediaDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) reject(err)
      else resolve(metadata.format.duration ?? 0)
    })
  })
}

export async function trimMedia(
  inputPath: string,
  start: number,
  duration: number,
  ext: string
): Promise<string> {
  const output = getTempPath(ext)
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(start)
      .setDuration(duration)
      .save(output)
      .on('end', () => resolve(output))
      .on('error', reject)
  })
}

export async function cleanTemp(...paths: string[]): Promise<void> {
  await Promise.allSettled(paths.map(p => unlink(p)))
}