// SPDX-License-Identifier: Apache-2.0
/* eslint-disable @next/next/no-img-element */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const socialCardSize = { width: 1200, height: 630 };
export const socialCardAlt = 'Claire — All your chats. One AI. Building in public.';
export const socialCardContentType = 'image/png';

const fontDirectory = join(process.cwd(), 'src', 'app', 'og', 'fonts');

export async function createSocialCard() {
  const [regular, semibold, brandIcon] = await Promise.all([
    readFile(join(fontDirectory, 'PublicSans-Regular.ttf')),
    readFile(join(fontDirectory, 'PublicSans-SemiBold.ttf')),
    readFile(join(process.cwd(), 'public', 'assets', 'brand', 'claire-app-icon-paper.png')),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: '#F4F1EA',
          color: '#10120F',
          padding: '62px 70px',
          fontFamily: 'Public Sans',
        }}
      >
        <div
          style={{
            width: 430,
            height: 430,
            position: 'absolute',
            right: -120,
            top: -170,
            borderRadius: 220,
            background: '#BBD9FF',
          }}
        />
        <div
          style={{
            width: 270,
            height: 270,
            position: 'absolute',
            right: 80,
            bottom: -170,
            borderRadius: 48,
            background: '#F3D7E2',
            transform: 'rotate(18deg)',
          }}
        />

        <div style={{ display: 'flex', width: '100%', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img
              src={`data:image/png;base64,${brandIcon.toString('base64')}`}
              alt=""
              width={42}
              height={42}
              style={{ borderRadius: 11 }}
            />
            <span style={{ fontSize: 27, fontWeight: 600, letterSpacing: -1 }}>claire</span>
          </div>

          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', width: 720, flexDirection: 'column', alignItems: 'flex-start' }}>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  marginBottom: 23,
                  padding: '8px 14px',
                  border: '1px solid #D9D7D0',
                  borderRadius: 999,
                  background: '#FFFDF8',
                  fontSize: 17,
                  letterSpacing: 2.3,
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    background: '#2F8F67',
                  }}
                />
                BUILDING CLAIRE IN PUBLIC
              </span>
              <span style={{ fontSize: 82, fontWeight: 600, lineHeight: 0.96, letterSpacing: -5.4 }}>
                All your chats.
              </span>
              <span
                style={{
                  marginTop: 12,
                  padding: '0 10px 7px',
                  background: '#DFFF64',
                  fontSize: 82,
                  fontWeight: 600,
                  lineHeight: 0.92,
                  letterSpacing: -5.4,
                }}
              >
                One AI.
              </span>
              <span style={{ marginTop: 29, color: '#62645F', fontSize: 25 }}>
                Join the early list and follow the road to launch.
              </span>
            </div>

            <div
              style={{
                width: 285,
                height: 355,
                display: 'flex',
                position: 'relative',
                flexDirection: 'column',
                padding: 22,
                border: '2px solid #10120F',
                borderRadius: 29,
                background: '#FFFDF8',
                boxShadow: '11px 11px 0 #10120F',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 18, fontWeight: 600 }}>Inbox</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>AI</span>
              </div>
              {[
                ['MK', 'Maya', 'Can you send that deck?', '#E6D8FF'],
                ['NO', 'Noah', 'Voice message · 0:24', '#BBD9FF'],
                ['ST', 'Studio team', 'Latest screens are in', '#F3D7E2'],
              ].map(([initials, name, message, color]) => (
                <div
                  key={name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    marginTop: 18,
                    paddingTop: 16,
                    borderTop: '1px solid #D9D7D0',
                  }}
                >
                  <span
                    style={{
                      width: 38,
                      height: 38,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      borderRadius: 19,
                      background: color,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {initials}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <b style={{ fontSize: 14 }}>{name}</b>
                    <span style={{ color: '#62645F', fontSize: 11 }}>{message}</span>
                  </span>
                </div>
              ))}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  marginTop: 'auto',
                  padding: '12px 13px',
                  borderRadius: 13,
                  background: '#DFFF64',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                AI&nbsp; Claire found a promise
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...socialCardSize,
      fonts: [
        { name: 'Public Sans', data: regular, weight: 400, style: 'normal' },
        { name: 'Public Sans', data: semibold, weight: 600, style: 'normal' },
      ],
    },
  );
}
