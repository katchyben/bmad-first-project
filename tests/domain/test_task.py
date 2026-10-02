"""Task value rules applied by `new_task` against an explicit `now`."""

from datetime import UTC, datetime, timedelta, timezone

import pytest

from bmad_first_project.domain.errors import DomainValidationError
from bmad_first_project.domain.task import (
    BLANK_TITLE_MESSAGE,
    DESCRIPTION_TOO_LONG_MESSAGE,
    PAST_DUE_MESSAGE,
    TITLE_TOO_LONG_MESSAGE,
    Task,
    TaskStatus,
    TaskView,
    new_task,
    view_task,
)

NOW = datetime(2026, 10, 1, 12, 30, 45, 123456, tzinfo=UTC)
TOMORROW = NOW + timedelta(days=1)


def test_messages_are_the_agreed_strings() -> None:
    assert BLANK_TITLE_MESSAGE == "Enter a title."
    assert TITLE_TOO_LONG_MESSAGE == "Keep the title to 200 characters or fewer."
    assert (
        DESCRIPTION_TOO_LONG_MESSAGE
        == "Keep the description to 5,000 characters or fewer."
    )
    assert PAST_DUE_MESSAGE == "That time has already passed."


def test_status_values_are_the_stored_strings() -> None:
    assert [s.value for s in TaskStatus] == [
        "to_do",
        "in_progress",
        "done",
        "cancelled",
    ]


def test_valid_task_is_trimmed_to_do_and_created_now() -> None:
    task = new_task("  Pay rent ", None, TOMORROW, NOW)

    assert task == Task(
        title="Pay rent",
        description=None,
        due_at=TOMORROW,
        status=TaskStatus.TO_DO,
        created_at=NOW,
        finished_at=None,
        previous_status=None,
        id=None,
    )
    assert task.due_at.tzinfo is UTC
    assert task.created_at.tzinfo is UTC


def test_task_is_frozen() -> None:
    task = new_task("Pay rent", None, TOMORROW, NOW)

    with pytest.raises(AttributeError):
        task.title = "Other"  # type: ignore[misc]


def test_due_exactly_now_is_accepted() -> None:
    assert new_task("Pay rent", None, NOW, NOW).due_at == NOW


def test_due_one_microsecond_ago_is_rejected() -> None:
    with pytest.raises(DomainValidationError) as caught:
        new_task("Pay rent", None, NOW - timedelta(microseconds=1), NOW)

    assert caught.value.message == "That time has already passed."


@pytest.mark.parametrize("title", ["", "   ", "\t\n "])
def test_blank_title_is_rejected(title: str) -> None:
    with pytest.raises(DomainValidationError) as caught:
        new_task(title, None, TOMORROW, NOW)

    assert caught.value.message == "Enter a title."


def test_title_of_200_code_points_after_trim_is_accepted() -> None:
    title = "😀" * 200

    assert new_task(f"  {title}  ", None, TOMORROW, NOW).title == title


def test_title_of_201_code_points_is_rejected() -> None:
    with pytest.raises(DomainValidationError) as caught:
        new_task("😀" * 201, None, TOMORROW, NOW)

    assert caught.value.message == "Keep the title to 200 characters or fewer."


def test_description_of_5000_code_points_is_accepted_untrimmed() -> None:
    description = " " + "😀" * 4998 + " "

    assert new_task("Pay rent", description, TOMORROW, NOW).description == description


def test_description_of_5001_code_points_is_rejected() -> None:
    with pytest.raises(DomainValidationError) as caught:
        new_task("Pay rent", "😀" * 5001, TOMORROW, NOW)

    assert caught.value.message == "Keep the description to 5,000 characters or fewer."


def test_empty_description_becomes_none() -> None:
    assert new_task("Pay rent", "", TOMORROW, NOW).description is None


def test_title_is_checked_before_due_at() -> None:
    with pytest.raises(DomainValidationError) as caught:
        new_task("", None, NOW - timedelta(days=1), NOW)

    assert caught.value.message == "Enter a title."


def test_non_utc_offset_is_compared_as_an_instant() -> None:
    plus_two = timezone(timedelta(hours=2))
    due = (NOW + timedelta(hours=1)).astimezone(plus_two)

    task = new_task("Pay rent", None, due, NOW)

    assert task.due_at == NOW + timedelta(hours=1)
    assert task.due_at.tzinfo is UTC
    assert (
        new_task("Pay rent", None, due, NOW.astimezone(plus_two)).created_at.tzinfo
        is UTC
    )
    with pytest.raises(DomainValidationError):
        new_task("Pay rent", None, (NOW - timedelta(hours=1)).astimezone(plus_two), NOW)


def test_naive_due_at_is_a_value_error() -> None:
    naive = TOMORROW.replace(tzinfo=None)

    with pytest.raises(ValueError) as caught:
        new_task("Pay rent", None, naive, NOW)

    assert not isinstance(caught.value, DomainValidationError)


def test_naive_now_is_a_value_error() -> None:
    with pytest.raises(ValueError) as caught:
        new_task("Pay rent", None, TOMORROW, NOW.replace(tzinfo=None))

    assert not isinstance(caught.value, DomainValidationError)


@pytest.mark.parametrize(
    ("due_at", "is_overdue"),
    [
        pytest.param(NOW - timedelta(microseconds=1), True, id="one-microsecond-ago"),
        pytest.param(NOW, False, id="exactly-now"),
        pytest.param(TOMORROW, False, id="tomorrow"),
    ],
)
def test_view_is_overdue_only_when_due_before_now(
    due_at: datetime, is_overdue: bool
) -> None:
    task = Task(
        title="Pay rent",
        description=None,
        due_at=due_at,
        status=TaskStatus.TO_DO,
        created_at=NOW,
        id=1,
    )

    assert view_task(task, NOW) == TaskView(task=task, is_overdue=is_overdue)


def test_view_compares_instants_across_offsets() -> None:
    plus_two = timezone(timedelta(hours=2))
    task = new_task("Pay rent", None, TOMORROW, NOW)

    later = (TOMORROW + timedelta(microseconds=1)).astimezone(plus_two)

    assert view_task(task, later).is_overdue
    assert not view_task(task, TOMORROW.astimezone(plus_two)).is_overdue


def test_view_is_frozen() -> None:
    view = view_task(new_task("Pay rent", None, TOMORROW, NOW), NOW)

    with pytest.raises(AttributeError):
        view.is_overdue = True  # type: ignore[misc]
