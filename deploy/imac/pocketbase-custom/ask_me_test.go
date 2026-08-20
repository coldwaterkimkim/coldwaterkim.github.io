package main

import (
	"testing"
	"time"
)

func TestAskQuestionAskerNameKSTBoundaries(t *testing.T) {
	tests := []struct {
		hour int
		want string
	}{
		{0, "잠 안 자는 질문자 42"},
		{1, "잠 안 자는 질문자 42"},
		{2, "진짜 안 자는 질문자 42"},
		{4, "진짜 안 자는 질문자 42"},
		{5, "너무 일찍 깬 질문자 42"},
		{6, "너무 일찍 깬 질문자 42"},
		{7, "정신 차리는 질문자 42"},
		{9, "정신 차리는 질문자 42"},
		{10, "배고픈 질문자 42"},
		{12, "배고픈 질문자 42"},
		{13, "딴짓 중인 질문자 42"},
		{16, "딴짓 중인 질문자 42"},
		{17, "할 말 생긴 질문자 42"},
		{19, "할 말 생긴 질문자 42"},
		{20, "오늘이 아쉬운 질문자 42"},
		{22, "오늘이 아쉬운 질문자 42"},
		{23, "잠 안 자는 질문자 42"},
	}

	for _, test := range tests {
		at := time.Date(2026, time.August, 20, test.hour, 0, 0, 0, koreaStandardTime)
		if got := askQuestionAskerName(at, 42); got != test.want {
			t.Errorf("hour %02d: got %q, want %q", test.hour, got, test.want)
		}
	}
}

func TestAskQuestionAskerNameConvertsToKST(t *testing.T) {
	// 2026-08-19 22:00 UTC is 2026-08-20 07:00 KST.
	at := time.Date(2026, time.August, 19, 22, 0, 0, 0, time.UTC)
	if got, want := askQuestionAskerName(at, 7), "정신 차리는 질문자 7"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}
