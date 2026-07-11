import { useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useIsOnline } from '../../hooks/useIsOnline';
import { getIsOnline } from '../../lib/network';
import { wipeLocalSession } from '../../lib/session';
import {
  DELETE_CONFIRM_PHRASE,
  canConfirmAccountDeletion,
  deleteAccountConfirmBody,
  requestAccountDeletion,
} from '../../lib/account';

interface DeleteAccountSheetProps {
  visible: boolean;
  /** Active-pet names — drives the single- vs multi-pet confirm copy (FR-10). */
  petNames: string[];
  onClose: () => void;
}

const OFFLINE_MSG = "You'll need a connection to delete your account.";
const FAILED_MSG = "We couldn't finish deleting your account. Check your connection and try again.";

// Destructive type-to-confirm account deletion (B-039 FR-9…FR-12). One surface,
// no modal-on-modal: type DELETE to arm, a single red action, honest copy, no
// dark patterns (no pre-checked "deactivate", no guilt copy, no hidden button).
// Disabled offline (FR-11). On success: sign out locally, which fires the
// SIGNED_OUT wipe (clearLocalData + active-pet clear + petStore.reset) and routes
// to auth, where a brief confirmation shows.
export function DeleteAccountSheet({ visible, petNames, onClose }: DeleteAccountSheetProps) {
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const [typed, setTyped] = useState('');
  const [inFlight, setInFlight] = useState(false);
  const [failed, setFailed] = useState(false);

  const canConfirm = canConfirmAccountDeletion({ typed, online, inFlight });

  function handleClose() {
    if (inFlight) return; // never dismiss mid-delete
    setTyped('');
    setFailed(false);
    onClose();
  }

  async function handleDelete() {
    if (!canConfirm) return;
    setFailed(false);

    // Final connectivity re-check the instant before firing (FR-11): the reactive
    // flag can lag a just-dropped connection. Belt-and-suspenders — the invoke
    // itself also fails honestly offline, never a false success.
    if (!(await getIsOnline())) {
      return; // `online` flips false via the listener; the offline message renders
    }

    setInFlight(true);
    const { ok } = await requestAccountDeletion();
    if (ok) {
      // Arm the auth-screen confirmation, then sign out LOCAL-only: the server
      // session is already gone with the account, so a local sign-out is enough
      // to fire the SIGNED_OUT wipe + route to auth without a doomed server
      // round-trip. Leave inFlight set — the route swap unmounts this sheet.
      useAuthStore.getState().setJustDeletedAccount(true);
      await supabase.auth.signOut({ scope: 'local' }).catch(async (e) => {
        console.warn('[DeleteAccountSheet] local signOut after delete failed:', e);
        // signOut normally emits SIGNED_OUT, whose handler runs the FR-9 wipe and
        // routes to auth. If it threw, that may not have fired — so run the same
        // teardown here (idempotent if it did) so a deleted account never leaves
        // pet-health data on the device, then route to auth ourselves.
        await wipeLocalSession();
        router.replace('/(auth)/login');
      });
      return;
    }
    setInFlight(false);
    setFailed(true);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.scrim} onPress={handleClose} />
        <View style={[styles.card, { marginBottom: insets.bottom + 18 }]}>
          <Text style={styles.title}>Delete your account?</Text>
          <Text style={styles.body}>{deleteAccountConfirmBody(petNames)}</Text>

          <Text style={styles.inputLabel}>Type {DELETE_CONFIRM_PHRASE} to confirm</Text>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={(t) => { setTyped(t); if (failed) setFailed(false); }}
            placeholder={DELETE_CONFIRM_PHRASE}
            placeholderTextColor={theme.colorTextDisabled}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            editable={!inFlight}
            accessibilityLabel={`Type ${DELETE_CONFIRM_PHRASE} to confirm account deletion`}
          />

          {!online && <Text style={styles.offlineMsg}>{OFFLINE_MSG}</Text>}
          {failed && <Text style={styles.failedMsg}>{FAILED_MSG}</Text>}

          <TouchableOpacity
            style={[styles.deleteBtn, !canConfirm && styles.deleteBtnDisabled]}
            onPress={handleDelete}
            disabled={!canConfirm}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canConfirm }}
          >
            {inFlight
              ? <WhorlSpinner size="sm" tint={theme.colorSurface} />
              : <Text style={styles.deleteBtnText}>Delete account</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleClose}
            disabled={inFlight}
            activeOpacity={0.7}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colorScrim,
  },
  card: {
    // 14 / +18 below mirror ArchivePetSheet so the two floating confirm sheets
    // share identical insets (off-grid by intent; tokenizing the archetype across
    // both sheets is a separate cleanup).
    marginHorizontal: 14,
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusLarge,
    paddingTop: theme.space3,
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space2,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: theme.space1,
  },
  inputLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
    marginTop: theme.space3,
    marginBottom: theme.space1,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: 13,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    backgroundColor: theme.colorSurface,
    letterSpacing: theme.trackingWide,
  },
  offlineMsg: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    textAlign: 'center',
    marginTop: theme.space2,
  },
  failedMsg: {
    fontSize: theme.textSM,
    color: theme.colorDestructive,
    textAlign: 'center',
    marginTop: theme.space2,
  },
  deleteBtn: {
    backgroundColor: theme.colorDestructive,
    borderRadius: theme.radiusMedium,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: theme.space2,
  },
  deleteBtnDisabled: {
    backgroundColor: theme.colorBorderStrong,
  },
  deleteBtnText: {
    color: theme.colorSurface,
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
  },
  cancelBtn: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: 4,
  },
  cancelText: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
});
