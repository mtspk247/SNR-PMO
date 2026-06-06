import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { sb, Organization } from '@/lib/supabase';
import { getCurrentUs