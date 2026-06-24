import { formatDate, format } from 'date-fns';

export const delay = (duration: number) => {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, duration);
    });
};

export const formattedDateUA = (date: Date) => format(date, 'dd.MM.yyyy HH:mm');
