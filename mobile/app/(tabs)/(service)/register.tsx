import { ApiClientError } from '@coffix/api-client';
import Feather from '@expo/vector-icons/Feather';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../../../src/components/Button';
import { ErrorState } from '../../../src/components/ErrorState';
import { IconButton } from '../../../src/components/IconButton';
import { Input } from '../../../src/components/Input';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useSession } from '../../../src/features/auth/useSession';
import type { MachineModel } from '../../../src/features/machines/api';
import {
  emptyMachineRegisterForm,
  toMachineCreate,
  validateMachineRegisterForm,
  type MachineRegisterForm,
} from '../../../src/features/machines/form';
import {
  useCreateMachine,
  useMachineModels,
} from '../../../src/features/machines/queries';
import {
  MachinePhotoPermissionError,
  pickMachinePhoto,
  type PickedImage,
  type PickerSource,
} from '../../../src/features/media/picker';
import {
  uploadMachineRegistrationPhoto,
  type MediaUploadHandle,
} from '../../../src/features/media/uploader';
import { goBack } from '../../../src/navigation/goBack';
import { colors, radii, spacing } from '../../../src/theme';

const CREATE_ERROR_MESSAGES: Record<string, string> = {
  MACHINE_MEDIA_NOT_AVAILABLE: 'התמונה שהועלתה אינה זמינה יותר. נסו לצלם או לבחור תמונה מחדש.',
  MACHINE_MODEL_NOT_AVAILABLE: 'דגם זה אינו זמין יותר לרישום. בחרו דגם אחר.',
  MACHINE_SERIAL_ALREADY_REGISTERED: 'מספר סידורי זה כבר רשום למכונה קיימת.',
  MACHINE_SERIAL_INVALID: 'מספר סידורי לא תואם לדגם שנבחר.',
};
const CREATE_FALLBACK_ERROR = 'לא הצלחנו לרשום את המכונה. נסו שוב.';

type PhotoState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number; handle: MediaUploadHandle; uri: string }
  | { status: 'done'; mediaId: string; uri: string }
  | { status: 'error'; image?: PickedImage; message: string };

function ModelOption({
  model,
  onSelect,
  selected,
}: {
  model: MachineModel;
  onSelect: (modelId: string) => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${model.manufacturer} ${model.model_name}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={() => onSelect(model.id)}
      style={[styles.modelOption, selected ? styles.modelOptionSelected : undefined]}
    >
      <Text color={colors.ink3} variant="eyebrow">{model.manufacturer}</Text>
      <Text variant="sectionTitle">{model.model_name}</Text>
    </Pressable>
  );
}

export function RegisterMachineContent({ sessionScope }: { sessionScope: string }) {
  const models = useMachineModels(sessionScope);
  const createMachine = useCreateMachine(sessionScope);
  const [form, setForm] = useState<MachineRegisterForm>(emptyMachineRegisterForm);
  const [touched, setTouched] = useState(false);
  const [photo, setPhoto] = useState<PhotoState>({ status: 'idle' });

  const errors = validateMachineRegisterForm(form);
  const createErrorCode = createMachine.error instanceof ApiClientError
    ? createMachine.error.problem.code
    : null;

  const startUpload = (image: PickedImage) => {
    const handle = uploadMachineRegistrationPhoto(image, ({ bytesSent, totalBytes }) => {
      const progress = totalBytes > 0 ? bytesSent / totalBytes : 0;
      setPhoto((current) => (
        current.status === 'uploading' ? { ...current, progress } : current
      ));
    });
    setPhoto({ handle, progress: 0, status: 'uploading', uri: image.uri });
    handle.result.then(
      (mediaId) => {
        setPhoto({ mediaId, status: 'done', uri: image.uri });
        setForm((current) => ({ ...current, mediaId }));
      },
      () => {
        setPhoto({ image, message: 'העלאת התמונה נכשלה.', status: 'error' });
      },
    );
  };

  const pickPhoto = async (source: PickerSource) => {
    try {
      const image = await pickMachinePhoto(source);
      if (image) {
        startUpload(image);
      }
    } catch (error) {
      if (error instanceof MachinePhotoPermissionError) {
        setPhoto({
          message: source === 'camera'
            ? 'יש לאשר גישה למצלמה בהגדרות המכשיר כדי לצלם תמונה.'
            : 'יש לאשר גישה לתמונות בהגדרות המכשיר כדי לבחור תמונה.',
          status: 'error',
        });
      }
    }
  };

  const cancelUpload = () => {
    if (photo.status === 'uploading') {
      photo.handle.cancel();
    }
    setPhoto({ status: 'idle' });
    setForm((current) => ({ ...current, mediaId: null }));
  };

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length > 0) {
      return;
    }
    createMachine.mutate(toMachineCreate(form), {
      onSuccess: (machine) => {
        router.replace(`/(tabs)/(service)/machines/${machine.id}` as Href);
      },
    });
  };

  const header = (
    <View style={styles.header}>
      <IconButton
        accessibilityLabel="חזרה"
        icon={<Feather color={colors.ink} name="chevron-right" size={20} />}
        onPress={() => goBack('/(tabs)/(service)' as Href)}
        style={styles.backButton}
      />
      <Text variant="screenTitle">רישום מכונה</Text>
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      {createMachine.isError ? (
        <Text accessibilityLiveRegion="polite" color={colors.accentDeep}>
          {(createErrorCode && CREATE_ERROR_MESSAGES[createErrorCode]) ?? CREATE_FALLBACK_ERROR}
        </Text>
      ) : null}
      <Button
        accessibilityLabel="רישום מכונה"
        disabled={createMachine.isPending || photo.status === 'uploading'}
        onPress={submit}
      >
        {createMachine.isPending ? 'רושמים מכונה' : 'רישום מכונה'}
      </Button>
    </View>
  );

  return (
    <Screen
      contentContainerStyle={styles.body}
      footer={footer}
      header={header}
      scroll
    >
      <Text color={colors.ink2} style={styles.intro}>
        רישום מכונה פותח אפשרות לבקשות שירות ותיעוד. מכונות שנרכשו דרך האפליקציה נרשמות אוטומטית.
      </Text>

      <Text style={styles.sectionLabel} variant="label">דגם מכונה</Text>
      {models.isPending ? (
        <ActivityIndicator color={colors.accentDeep} style={styles.modelsLoading} />
      ) : models.isError ? (
        <ErrorState
          message="לא הצלחנו לטעון את הדגמים הנתמכים"
          onRetry={() => void models.refetch()}
        />
      ) : (
        <View accessibilityRole="radiogroup" style={styles.modelList}>
          {models.data.map((model) => (
            <ModelOption
              key={model.id}
              model={model}
              onSelect={(modelId) => setForm((current) => ({ ...current, machineModelId: modelId }))}
              selected={form.machineModelId === model.id}
            />
          ))}
        </View>
      )}
      {touched && errors.machineModelId ? (
        <Text accessibilityLiveRegion="polite" color={colors.accentDeep} variant="caption">
          {errors.machineModelId}
        </Text>
      ) : null}

      <Input
        containerStyle={styles.field}
        error={touched ? errors.serialNumber : undefined}
        label="מספר סידורי"
        onChangeText={(serialNumber) => setForm((current) => ({ ...current, serialNumber }))}
        placeholder="לדוגמה: CFX1-000123"
        value={form.serialNumber}
      />

      <Input
        containerStyle={styles.field}
        error={touched ? errors.purchaseDate : undefined}
        label="תאריך רכישה (אופציונלי)"
        leading={<Feather color={colors.ink3} name="calendar" size={18} />}
        onChangeText={(purchaseDate) => setForm((current) => ({ ...current, purchaseDate }))}
        placeholder="שנה-חודש-יום, לדוגמה 2025-05-06"
        value={form.purchaseDate}
      />

      <View style={styles.field}>
        <Text color={colors.ink2} style={styles.photoLabel} variant="label">
          קבלת רכישה (אופציונלי)
        </Text>
        {photo.status === 'idle' ? (
          <View style={styles.photoActions}>
            <Pressable
              accessibilityHint="פותח את המצלמה כדי לצלם תמונה של קבלת הרכישה"
              accessibilityLabel="צילום קבלה"
              accessibilityRole="button"
              onPress={() => void pickPhoto('camera')}
              style={styles.photoAction}
            >
              <Feather color={colors.ink2} name="camera" size={22} />
              <Text color={colors.ink2} variant="caption">צילום קבלה</Text>
              <Text color={colors.ink3} variant="caption">JPG, PNG, HEIC · עד 10MB</Text>
            </Pressable>
            <Pressable
              accessibilityHint="פותח את גלריית התמונות כדי לבחור תמונה קיימת"
              accessibilityLabel="בחירת תמונה מהגלריה"
              accessibilityRole="button"
              onPress={() => void pickPhoto('library')}
              style={styles.photoLink}
            >
              <Text color={colors.accent} variant="caption">או בחירה מהגלריה</Text>
            </Pressable>
          </View>
        ) : null}
        {photo.status === 'uploading' ? (
          <View accessibilityLabel="מעלים תמונה" accessible style={styles.photoPreview}>
            <Image accessibilityIgnoresInvertColors source={{ uri: photo.uri }} style={styles.photoThumb} />
            <View style={styles.photoProgress}>
              <ActivityIndicator color={colors.accentDeep} />
              <Text color={colors.ink2} variant="caption">
                {`מעלים תמונה… ${Math.round(photo.progress * 100)}%`}
              </Text>
              <Pressable accessibilityLabel="ביטול העלאת התמונה" accessibilityRole="button" onPress={cancelUpload}>
                <Text color={colors.accentDeep} variant="caption">ביטול</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {photo.status === 'done' ? (
          <View accessibilityLabel="תמונה הועלתה בהצלחה" accessible style={styles.photoPreview}>
            <Image accessibilityIgnoresInvertColors source={{ uri: photo.uri }} style={styles.photoThumb} />
            <Pressable accessibilityLabel="הסרת התמונה" accessibilityRole="button" onPress={cancelUpload}>
              <Feather color={colors.accentDeep} name="x-circle" size={22} />
            </Pressable>
          </View>
        ) : null}
        {photo.status === 'error' ? (
          <View style={styles.photoError}>
            <Text accessibilityLiveRegion="polite" color={colors.accentDeep} variant="caption">
              {photo.message}
            </Text>
            {photo.image ? (
              <Pressable
                accessibilityLabel="ניסיון העלאה נוסף"
                accessibilityRole="button"
                onPress={() => startUpload(photo.image!)}
              >
                <Text color={colors.accent} variant="caption">ניסיון נוסף</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

export default function RegisterMachineScreen() {
  const { sessionScope } = useSession();
  return <RegisterMachineContent sessionScope={sessionScope ?? ''} />;
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  backButton: {
    borderRadius: radii.pill,
  },
  body: {
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
    paddingEnd: spacing.xl,
    paddingStart: spacing.xl,
  },
  intro: {
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    marginBottom: spacing.xs,
  },
  modelsLoading: {
    marginVertical: spacing.lg,
  },
  modelList: {
    gap: spacing.sm,
  },
  modelOption: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1.5,
    padding: spacing.md,
  },
  modelOptionSelected: {
    borderColor: colors.ink,
  },
  field: {
    gap: spacing.sm,
  },
  photoLabel: {
    marginBottom: spacing.xs,
  },
  photoActions: {
    gap: spacing.sm,
  },
  photoAction: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: spacing.xs,
    paddingVertical: spacing['2xl'],
  },
  photoLink: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  photoPreview: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  photoThumb: {
    backgroundColor: colors.chip,
    borderRadius: radii.input,
    height: 64,
    width: 64,
  },
  photoProgress: {
    flex: 1,
    gap: spacing.xs,
  },
  photoError: {
    gap: spacing.xs,
  },
  footer: {
    backgroundColor: colors.cream,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
});
