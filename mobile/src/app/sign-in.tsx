import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Fingerprint, Globe } from 'lucide-react-native';

import { APP_URL } from '@/lib/config';
import {
  COUNTRIES, COUNTRY_IDENTIFIERS, validateIdentifiers, identifiersToRpcParams,
  type CountryCode, type IdentifierValues,
} from '@/lib/companyIdentifiers';
import { signInWithGoogle } from '@/lib/googleOAuth';
import { joinCompanyWithToken, validateInviteToken, type InviteTokenData } from '@/lib/inviteJoin';
import { ensureStaffEntity } from '@/lib/staffEntityService';
import { supabase } from '@/lib/supabase';
import { Radii } from '@/constants/theme';
import { useGradients, useTheme } from '@/hooks/use-theme';
import { useIsLandscapeTablet } from '@/hooks/use-tablet-layout';
import { GradientButton } from '@/components/ui/GradientButton';
import { GradientText } from '@/components/ui/GradientText';
import { HeroBackground } from '@/components/ui/HeroBackground';

type AuthMode = 'login' | 'register';

// Mirrors app/(marketing)/login/page.tsx's VALUE_PROPS exactly.
const VALUE_PROPS = [
  'Build the tables and workflow your business runs on',
  'Send invoices, texts, and emails straight from your workflow',
  'Manage multiple companies under one login',
];

// The left half of the iPad-landscape split (see SignInScreen) -- mirrors
// the web login page's "Canva-style split login" brand panel (same
// gradient direction, same value props), shown only in landscape on iPad
// since portrait/phone don't have the width to spare. Phone/portrait keep
// the single centered card unchanged; this is purely additive.
function BrandPanel() {
  const gradients = useGradients();
  return (
    <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.brandPanel}>
      <View style={styles.brandPanelTop}>
        <View style={styles.brandPanelIcon}>
          <Fingerprint color={gradients.primary[1]} size={22} />
        </View>
        <Text style={styles.brandPanelName}>Diract</Text>
      </View>
      <View>
        <Text style={styles.brandPanelHeading}>Your process,{'\n'}your CRM.</Text>
        <View style={{ gap: 14 }}>
          {VALUE_PROPS.map((v) => (
            <View key={v} style={styles.brandPanelPropRow}>
              <CheckCircle2 color="#fff" size={18} />
              <Text style={styles.brandPanelPropText}>{v}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={styles.brandPanelFooter}>DIRACT · CONFIGURABLE CRM</Text>
    </LinearGradient>
  );
}

export default function SignInScreen() {
  const theme = useTheme();
  const gradients = useGradients();
  const isLandscapeTablet = useIsLandscapeTablet();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [country, setCountry] = useState<CountryCode>('AU');
  const [identifiers, setIdentifiers] = useState<IdentifierValues>({});
  const [showPassword, setShowPassword] = useState(false);

  const [inviteTokenInput, setInviteTokenInput] = useState('');
  const [inviteData, setInviteData] = useState<InviteTokenData | null>(null);
  const [inviteChecking, setInviteChecking] = useState(false);
  const [inviteInvalid, setInviteInvalid] = useState(false);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isJoinInvite = !!inviteData?.company_id;

  useEffect(() => {
    // A tapped invite email link (diract://join?token=...) prefills the
    // code instead of the user having to copy/paste it in by hand.
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      const { queryParams } = Linking.parse(url);
      const token = typeof queryParams?.token === 'string' ? queryParams.token : undefined;
      if (token) setInviteTokenInput(token);
    });
  }, []);

  useEffect(() => {
    const token = inviteTokenInput.trim();
    if (!token) {
      setInviteData(null);
      setInviteInvalid(false);
      return;
    }
    setInviteChecking(true);
    const timeout = setTimeout(async () => {
      const data = await validateInviteToken(token);
      setInviteData(data);
      setInviteInvalid(!data);
      setInviteChecking(false);
      if (data) setMode(data.company_id ? 'login' : 'register');
    }, 400);
    return () => clearTimeout(timeout);
  }, [inviteTokenInput]);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    clearMessages();
    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) setError(oauthError);
    // On success, onAuthStateChange in SessionProvider flips the session and
    // Stack.Protected swaps in the (app) group -- nothing else to do here.
    // The invite join (if any) is finished by the effect in the app shell
    // that reacts to a fresh session + pending invite, mirrored below for
    // the password path too.
    if (!oauthError && inviteData) {
      await joinCompanyWithToken(inviteData);
    }
    setGoogleLoading(false);
  };

  const handleLogin = async () => {
    clearMessages();
    if (inviteTokenInput.trim() && inviteInvalid) {
      setError('This invitation link is invalid or has already been used.');
      return;
    }
    setLoading(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      const msg = signInError.message.toLowerCase();
      setError(
        msg.includes('email not confirmed')
          ? 'Please confirm your email before signing in.'
          : msg.includes('invalid login')
          ? 'Incorrect email or password.'
          : signInError.message,
      );
      setLoading(false);
      return;
    }
    if (data.session && inviteData?.company_id) {
      await joinCompanyWithToken(inviteData);
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    clearMessages();
    if (inviteTokenInput.trim() && inviteInvalid) {
      setError('This invitation link is invalid or has already been used.');
      return;
    }
    if (!isJoinInvite && !companyName.trim()) {
      setError('Company name is required.');
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!isJoinInvite) {
      const identifierError = validateIdentifiers(country, identifiers);
      if (identifierError) {
        setError(identifierError);
        return;
      }
    }

    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName || email.split('@')[0] } },
      });
      if (authError) throw new Error(authError.message);
      if (!authData.user) throw new Error('Account creation failed.');

      const userId = authData.user.id;

      if (isJoinInvite && inviteData) {
        await supabase.from('profiles').upsert(
          {
            id: userId,
            full_name: fullName || email.split('@')[0],
            email,
            active_company_id: inviteData.company_id,
            is_admin: false,
            is_active: true,
          },
          { onConflict: 'id' },
        );
        await joinCompanyWithToken(inviteData);
      } else {
        // register_company_and_profile never accepted a p_invite_token
        // param -- passing one makes PostgREST unable to match any
        // function overload at all, silently breaking every fresh
        // self-signup with "Could not find the function ... in the schema
        // cache". See app/(marketing)/login/page.tsx's own handleRegister
        // for the same fix on the web app (commit 3d41f3d), and
        // supabase/migrations/20260808050000_register_company_country_identifiers.sql
        // for the function's current real signature.
        const { data: result, error: rpcError } = await supabase.rpc('register_company_and_profile', {
          p_user_id: userId,
          p_full_name: fullName || email.split('@')[0],
          p_email: email,
          p_company_name: companyName.trim(),
          ...identifiersToRpcParams(country, identifiers),
        });
        if (rpcError) throw new Error(`Registration failed: ${rpcError.message}`);
        if (result && !result.success) {
          if (result.error_code === 'duplicate_email') {
            throw new Error('An account with this email already exists. Please sign in instead.');
          }
          throw new Error(result.error || 'Registration failed');
        }

        // register_company_and_profile's own return shape isn't relied on
        // elsewhere -- reading the company id back off the profile it just
        // set avoids assuming one, matching the web app's own approach.
        const { data: newProfile } = await supabase.from('profiles').select('active_company_id').eq('id', userId).maybeSingle();
        if (newProfile?.active_company_id) {
          await ensureStaffEntity(supabase, newProfile.active_company_id, userId);
        }
      }

      if (!authData.session) {
        setSuccess('Account created! Check your inbox and confirm your email to get started.');
        setLoading(false);
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  const openForgotPassword = () => {
    WebBrowser.openBrowserAsync(`${APP_URL}/login/forgot-password`);
  };

  return (
    <View style={{ flex: 1, flexDirection: isLandscapeTablet ? 'row' : 'column' }}>
      {isLandscapeTablet && <BrandPanel />}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <HeroBackground>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }, isLandscapeTablet && styles.cardLandscape]}>
          {isLandscapeTablet ? (
            // Branding lives in BrandPanel to the left instead -- just the
            // mode heading here, mirroring the web login page's `hidden
            // lg:block` title block.
            <View style={styles.formHeading}>
              <Text style={[styles.formHeadingTitle, { color: theme.text }]}>
                {mode === 'register' ? 'Create your account' : 'Welcome back'}
              </Text>
              <Text style={[styles.formHeadingSubtitle, { color: theme.textSecondary }]}>
                {mode === 'register'
                  ? isJoinInvite
                    ? `Join ${inviteData?.company_name ?? 'Company'}`
                    : 'Set up your firm’s workspace'
                  : isJoinInvite
                  ? `Sign in to join ${inviteData?.company_name ?? 'Company'}`
                  : 'Sign in to your workspace'}
              </Text>
            </View>
          ) : (
            <View style={styles.brandRow}>
              <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.brandIcon}>
                <Fingerprint color="#fff" size={26} />
              </LinearGradient>
              <GradientText style={styles.brandTitle}>Diract</GradientText>
              <Text style={[styles.brandSubtitle, { color: theme.textSecondary }]}>
                {mode === 'register'
                  ? isJoinInvite
                    ? `Join ${inviteData?.company_name ?? 'Company'}`
                    : 'New Company Enrolment'
                  : isJoinInvite
                  ? `Sign in to join ${inviteData?.company_name ?? 'Company'}`
                  : 'Enterprise Secure Access'}
              </Text>
            </View>
          )}

          {inviteTokenInput.trim().length > 0 && (
            <View
              style={[
                styles.banner,
                {
                  backgroundColor: inviteInvalid ? theme.dangerBackground : inviteData ? theme.successBackground : theme.backgroundSelected,
                },
              ]}
            >
              {inviteChecking ? (
                <ActivityIndicator size="small" />
              ) : inviteInvalid ? (
                <AlertCircle color={theme.danger} size={14} />
              ) : (
                <CheckCircle2 color={theme.success} size={14} />
              )}
              <Text
                style={[styles.bannerText, { color: inviteInvalid ? theme.danger : inviteData ? theme.success : theme.textSecondary }]}
              >
                {inviteChecking
                  ? 'Validating invitation...'
                  : inviteInvalid
                  ? 'This invitation link is invalid or has already been used'
                  : isJoinInvite
                  ? `You've been invited to join ${inviteData?.company_name ?? 'a company'}`
                  : 'Valid invitation'}
              </Text>
            </View>
          )}

          {error && (
            <View style={[styles.banner, { backgroundColor: theme.dangerBackground }]}>
              <AlertCircle color={theme.danger} size={14} />
              <Text style={[styles.bannerText, { color: theme.danger }]}>{error}</Text>
            </View>
          )}
          {success && (
            <View style={[styles.banner, { backgroundColor: theme.successBackground }]}>
              <CheckCircle2 color={theme.success} size={14} />
              <Text style={[styles.bannerText, { color: theme.success }]}>{success}</Text>
            </View>
          )}

          <Pressable
            style={[styles.googleButton, { borderColor: theme.border, backgroundColor: theme.backgroundSelected }]}
            disabled={googleLoading || loading || inviteInvalid}
            onPress={handleGoogle}
          >
            {googleLoading ? <ActivityIndicator size="small" /> : <Globe color={theme.accentSecondary} size={18} />}
            <Text style={[styles.googleButtonText, { color: theme.text }]}>Continue with Google</Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textSecondary }]}>OR CONTINUE WITH EMAIL</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>

          {mode === 'register' && (
            <TextInput
              placeholder="Full name"
              placeholderTextColor={theme.textSecondary}
              value={fullName}
              onChangeText={(v) => {
                setFullName(v);
                clearMessages();
              }}
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
            />
          )}

          {mode === 'register' && !isJoinInvite && (
            <View style={[styles.companyBlock, { borderColor: theme.border }]}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>COMPANY DETAILS</Text>
              <TextInput
                placeholder="Company name"
                placeholderTextColor={theme.textSecondary}
                value={companyName}
                onChangeText={(v) => {
                  setCompanyName(v);
                  clearMessages();
                }}
                style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }]}
              />
              <View style={styles.chipRow}>
                {COUNTRIES.map((c) => {
                  const selected = country === c.code;
                  return (
                    <Pressable
                      key={c.code}
                      onPress={() => {
                        setCountry(c.code);
                        setIdentifiers({});
                        clearMessages();
                      }}
                      style={[
                        styles.chip,
                        { borderColor: theme.border, backgroundColor: selected ? theme.accentSecondary : theme.backgroundElement },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: selected ? '#fff' : theme.textSecondary }]}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {COUNTRY_IDENTIFIERS[country].length > 0 && (
                <View style={styles.row}>
                  {COUNTRY_IDENTIFIERS[country].map((field) => (
                    <TextInput
                      key={field.key}
                      placeholder={field.placeholder}
                      placeholderTextColor={theme.textSecondary}
                      value={identifiers[field.key] || ''}
                      onChangeText={(v) => setIdentifiers((prev) => ({ ...prev, [field.key]: v }))}
                      style={[styles.input, styles.rowInput, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }]}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          <TextInput
            placeholder="Corporate email"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              clearMessages();
            }}
            style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
          />

          <View>
            <TextInput
              placeholder="Password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                clearMessages();
              }}
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
            />
            <Pressable
              style={styles.eyeButton}
              onPress={() => setShowPassword((v) => !v)}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff color={theme.textSecondary} size={16} /> : <Eye color={theme.textSecondary} size={16} />}
            </Pressable>
          </View>

          {mode === 'register' && (
            <TextInput
              placeholder="Confirm password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry={!showPassword}
              value={confirmPassword}
              onChangeText={(v) => {
                setConfirmPassword(v);
                clearMessages();
              }}
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
            />
          )}

          <TextInput
            placeholder="Invite code (optional)"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            value={inviteTokenInput}
            onChangeText={setInviteTokenInput}
            style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
          />

          {mode === 'login' && (
            <Pressable onPress={openForgotPassword} style={styles.forgotRow}>
              <Text style={[styles.forgotText, { color: theme.textSecondary }]}>Forgot password?</Text>
            </Pressable>
          )}

          <GradientButton
            style={styles.submitButton}
            loading={loading}
            disabled={googleLoading || inviteInvalid}
            onPress={mode === 'login' ? handleLogin : handleRegister}
          >
            {mode === 'login'
              ? isJoinInvite
                ? `Sign in & join ${inviteData?.company_name ?? 'company'}`
                : 'Sign in'
              : isJoinInvite
              ? `Create account & join ${inviteData?.company_name ?? 'company'}`
              : 'Create account'}
          </GradientButton>

          <Pressable
            onPress={() => {
              setMode((m) => (m === 'login' ? 'register' : 'login'));
              clearMessages();
              setPassword('');
              setConfirmPassword('');
            }}
            style={styles.switchModeRow}
          >
            <Text style={[styles.switchModeText, { color: theme.textSecondary }]}>
              {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      </HeroBackground>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { borderRadius: Radii.card, padding: 24, gap: 12 },
  cardLandscape: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  brandRow: { alignItems: 'center', marginBottom: 8 },
  formHeading: { marginBottom: 8 },
  formHeadingTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  formHeadingSubtitle: { fontSize: 13, marginTop: 6 },
  brandPanel: { flex: 1, justifyContent: 'space-between', padding: 40 },
  brandPanelTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandPanelIcon: {
    width: 40,
    height: 40,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandPanelName: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
  brandPanelHeading: { color: '#fff', fontSize: 28, fontWeight: '300', letterSpacing: -0.5, lineHeight: 34, marginBottom: 28 },
  brandPanelPropRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  brandPanelPropText: { flex: 1, color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  brandPanelFooter: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600', letterSpacing: 3, textTransform: 'uppercase' },
  brandIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  brandTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  brandSubtitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginTop: 6, textTransform: 'uppercase' },
  banner: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 16 },
  bannerText: { fontSize: 12, fontWeight: '700', flex: 1 },
  googleButton: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  googleButtonText: { fontWeight: '700', fontSize: 14 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  input: { padding: 14, borderRadius: Radii.input, borderWidth: 1, fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  rowInput: { flex: 1 },
  companyBlock: { borderWidth: 1, borderRadius: Radii.input, padding: 12, gap: 8 },
  sectionLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radii.pill, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },
  eyeButton: { position: 'absolute', right: 16, top: 14 },
  forgotRow: { alignItems: 'flex-end', marginTop: -4 },
  forgotText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  submitButton: { marginTop: 6 },
  switchModeRow: { alignItems: 'center', marginTop: 6 },
  switchModeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
});
