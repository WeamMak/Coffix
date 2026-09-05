import { ApiClientError } from '@coffix/api-client';
import RNDateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Feather from '@expo/vector-icons/Feather';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, View } from 'react-native';

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

type AutocompleteOption = { id: string; label: string };

function AutocompleteField({
  disabledHint,
  editable = true,
  error,
  label,
  noMatchesLabel,
  onBlur,
  onChangeText,
  onFocus,
  onSelect,
  placeholder,
  showSuggestions,
  suggestions,
  value,
}: {
  disabledHint?: string;
  editable?: boolean;
  error?: string;
  label: string;
  noMatchesLabel: string;
  onBlur: () => void;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onSelect: (option: AutocompleteOption) => void;
  placeholder?: string;
  showSuggestions: boolean;
  suggestions: AutocompleteOption[];
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Input
        accessibilityLabel={label}
        editable={editable}
        error={error}
        label={label}
        labelVariant="label"
        onBlur={onBlur}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        value={value}
      />
      {disabledHint ? (
        <Text color={colors.ink3} variant="caption">{disabledHint}</Text>
      ) : null}
      {showSuggestions ? (
        suggestions.length > 0 ? (
          <View style={styles.suggestions}>
            {suggestions.map((option) => (
              <Pressable
                accessibilityLabel={option.label}
                accessibilityRole="button"
                key={option.id}
                onPress={() => onSelect(option)}
                style={styles.suggestionRow}
              >
                <Text>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text color={colors.ink3} variant="caption">{noMatchesLabel}</Text>
        )
      ) : null}
    </View>
  );
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// The calendar icon opens the device's native date picker (Android: an
// imperative dialog; iOS: an inline picker rendered below the field), capped
// at today. Typing the date directly stays available on every platform,
// including web, where this native picker has no implementation at all.
function PurchaseDateField({
  error,
  onChangeText,
  value,
}: {
  error?: string;
  onChangeText: (iso: string) => void;
  value: string;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const today = new Date();
  const selected = parseIsoDate(value) ?? today;

  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        maximumDate: today,
        mode: 'date',
        onValueChange: (_event, date) => onChangeText(toIsoDate(date)),
        value: selected,
      });
      return;
    }
    if (Platform.OS === 'ios') {
      setShowPicker(true);
    }
  };

  return (
    <View style={styles.field}>
      <Input
        error={error}
        label="תאריך רכישה (אופציונלי)"
        labelVariant="label"
        leading={(
          <Pressable
            accessibilityLabel="בחירת תאריך מלוח שנה"
            accessibilityRole="button"
            onPress={openPicker}
          >
            <Feather color={colors.ink3} name="calendar" size={18} />
          </Pressable>
        )}
        onChangeText={onChangeText}
        placeholder="שנה-חודש-יום, לדוגמה 2025-05-06"
        value={value}
      />
      {Platform.OS === 'ios' && showPicker ? (
        <RNDateTimePicker
          display="inline"
          maximumDate={today}
          mode="date"
          onValueChange={(_event, date) => {
            setShowPicker(false);
            onChangeText(toIsoDate(date));
          }}
          value={selected}
        />
      ) : null}
    </View>
  );
}

export function RegisterMachineContent({ sessionScope }: { sessionScope: string }) {
  const models = useMachineModels(sessionScope);
  const createMachine = useCreateMachine(sessionScope);
  const [form, setForm] = useState<MachineRegisterForm>(emptyMachineRegisterForm);
  const [touched, setTouched] = useState(false);
  const [photo, setPhoto] = useState<PhotoState>({ status: 'idle' });
  const [manufacturer, setManufacturer] = useState('');
  const [brandQuery, setBrandQuery] = useState('');
  const [brandFocused, setBrandFocused] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [modelFocused, setModelFocused] = useState(false);
  const brandBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (brandBlurTimeout.current) {
      clearTimeout(brandBlurTimeout.current);
    }
    if (modelBlurTimeout.current) {
      clearTimeout(modelBlurTimeout.current);
    }
  }, []);

  const manufacturers = models.data
    ? Array.from(new Set(models.data.map((model) => model.manufacturer))).sort((a, b) => (
      a.localeCompare(b)
    ))
    : [];
  const brandMatch = brandQuery.trim().toLowerCase();
  const brandSuggestions: AutocompleteOption[] = manufacturers
    .filter((option) => option.toLowerCase().startsWith(brandMatch))
    .slice(0, 5)
    .map((option) => ({ id: option, label: option }));

  const modelsForManufacturer: MachineModel[] = (models.data ?? [])
    .filter((model) => model.manufacturer === manufacturer)
    .sort((a, b) => a.model_name.localeCompare(b.model_name));
  const modelMatch = modelQuery.trim().toLowerCase();
  const modelSuggestions: AutocompleteOption[] = modelsForManufacturer
    .filter((model) => model.model_name.toLowerCase().startsWith(modelMatch))
    .slice(0, 5)
    .map((model) => ({ id: model.id, label: model.model_name }));

  const selectManufacturer = (option: AutocompleteOption) => {
    setManufacturer(option.id);
    setBrandQuery(option.label);
    setBrandFocused(false);
    setModelQuery('');
    setForm((current) => ({ ...current, machineModelId: '' }));
  };

  const changeBrandQuery = (text: string) => {
    setBrandQuery(text);
    if (manufacturer && text !== manufacturer) {
      setManufacturer('');
      setModelQuery('');
      setForm((current) => ({ ...current, machineModelId: '' }));
    }
  };

  const focusBrand = () => {
    if (brandBlurTimeout.current) {
      clearTimeout(brandBlurTimeout.current);
      brandBlurTimeout.current = null;
    }
    setBrandFocused(true);
  };
  // A short delay lets a suggestion's onPress register before the list
  // hides; without it, the blur fires first and the tap never lands.
  const blurBrand = () => {
    brandBlurTimeout.current = setTimeout(() => setBrandFocused(false), 150);
  };

  const selectModel = (option: AutocompleteOption) => {
    setModelQuery(option.label);
    setModelFocused(false);
    setForm((current) => ({ ...current, machineModelId: option.id }));
  };

  const changeModelQuery = (text: string) => {
    setModelQuery(text);
    if (form.machineModelId) {
      setForm((current) => ({ ...current, machineModelId: '' }));
    }
  };

  const focusModel = () => {
    if (modelBlurTimeout.current) {
      clearTimeout(modelBlurTimeout.current);
      modelBlurTimeout.current = null;
    }
    setModelFocused(true);
  };
  const blurModel = () => {
    modelBlurTimeout.current = setTimeout(() => setModelFocused(false), 150);
  };

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

      {models.isPending ? (
        <ActivityIndicator color={colors.accentDeep} style={styles.modelsLoading} />
      ) : models.isError ? (
        <ErrorState
          message="לא הצלחנו לטעון את הדגמים הנתמכים"
          onRetry={() => void models.refetch()}
        />
      ) : (
        <>
          <AutocompleteField
            label="מותג"
            noMatchesLabel="לא נמצאו מותגים תואמים"
            onBlur={blurBrand}
            onChangeText={changeBrandQuery}
            onFocus={focusBrand}
            onSelect={selectManufacturer}
            placeholder="הקלידו כדי לחפש מותג"
            showSuggestions={brandFocused}
            suggestions={brandSuggestions}
            value={brandQuery}
          />

          <AutocompleteField
            disabledHint={manufacturer ? undefined : 'יש לבחור מותג תחילה'}
            editable={Boolean(manufacturer)}
            error={touched ? errors.machineModelId : undefined}
            label="דגם"
            noMatchesLabel="לא נמצאו דגמים תואמים"
            onBlur={blurModel}
            onChangeText={changeModelQuery}
            onFocus={focusModel}
            onSelect={selectModel}
            placeholder={manufacturer ? 'הקלידו כדי לחפש דגם' : undefined}
            showSuggestions={modelFocused}
            suggestions={modelSuggestions}
            value={modelQuery}
          />
        </>
      )}

      <Input
        containerStyle={styles.field}
        error={touched ? errors.serialNumber : undefined}
        label="מספר סידורי"
        labelVariant="label"
        onChangeText={(serialNumber) => setForm((current) => ({ ...current, serialNumber }))}
        placeholder="כפי שמופיע על תווית המכונה"
        value={form.serialNumber}
      />

      <PurchaseDateField
        error={touched ? errors.purchaseDate : undefined}
        onChangeText={(purchaseDate) => setForm((current) => ({ ...current, purchaseDate }))}
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
  modelsLoading: {
    marginVertical: spacing.lg,
  },
  field: {
    gap: spacing.sm,
  },
  suggestions: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  suggestionRow: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
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
